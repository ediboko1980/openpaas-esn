'use strict';

angular.module('esn.calendar')
  .factory('CalendarRightShell', function(CALENDAR_RIGHT, RightSet, _, calendarUtils) {

    //the idea here is that there is a multitude of possible combinaison of webdav right and webdav sharing right
    //I will suppose that right are only settle by OpenPaas and that the only possible combinaison are the following
    //
    // admin: the user has the following WEBDAV right: share, read, write, write-properties, he could also have a shared instance
    // read_write: he have no WEBDAV right but one a shared instance with readwrite access
    // read: he have no WEBDAV right but one a shared intance with read access
    // free_busy: he own no shared instance and has only the WEBDAV right read-free-busy
    // none: he own no shared instance and no WEBDAV right BUT FOR THE MOMENT I do not know we can overwrite global read-free-busy
    var matrix = {};

    matrix[CALENDAR_RIGHT.ADMIN] = {
      shouldHave: [
        RightSet.SHARE,
        RightSet.READ,
        RightSet.WRITE,
        RightSet.WRITE_PROPERTIES
      ],
      shouldNotHave: []
    };

    matrix[CALENDAR_RIGHT.READ_WRITE] = {
      shouldHave: [
        RightSet.SHAREE_READWRITE
      ],
      shouldNotHave: [
        RightSet.SHARE,
        RightSet.WRITE_PROPERTIES,
        RightSet.SHAREE_READ
      ]
    };

    matrix[CALENDAR_RIGHT.READ] = {
      shouldHave: [
        RightSet.SHAREE_READ
      ],
      shouldNotHave: [
        RightSet.SHAREE_READWRITE,
        RightSet.SHARE,
        RightSet.WRITE_PROPERTIES,
        RightSet.WRITE
      ]
    };

    matrix[CALENDAR_RIGHT.FREE_BUSY] = {
      shouldHave: [
        RightSet.FREE_BUSY
      ],
      shouldNotHave: [
        RightSet.READ,
        RightSet.SHAREE_READ,
        RightSet.SHAREE_READWRITE,
        RightSet.SHARE,
        RightSet.WRITE_PROPERTIES,
        RightSet.WRITE
      ]
    };

    matrix[CALENDAR_RIGHT.NONE] = {
      shouldHave: [],
      shouldNotHave: [
        RightSet.FREE_BUSY,
        RightSet.READ,
        RightSet.SHAREE_READ,
        RightSet.SHAREE_READWRITE,
        RightSet.SHARE,
        RightSet.WRITE_PROPERTIES,
        RightSet.WRITE
      ]
    };

    function sumupRight(rightSet) {
      var result;

      _.forEach(matrix, function(matrix, right) {
        if (rightSet.hasAtLeastAllOfThosePermissions(matrix.shouldHave) && rightSet.hasNoneOfThosePermissions(matrix.shouldNotHave)) {
          result = right;

          return false;
        }
      });

      return result || CALENDAR_RIGHT.CUSTOM;
    }

    var principalRegexp = new RegExp('principals/users/([^/]*)$');

    function CalendarRightShell(acl, invite) {
      this._userRight = {};
      this._userEmails = {};
      this._public = new RightSet();

      acl.forEach(function(line) {
        var userRightSet, userId, match = line.principal && line.principal.match(principalRegexp);

        if (match) {
          userId = match[1];
          userRightSet = this._getUserSet(userId);
        } else if (line.principal === '{DAV:}authenticated') {
          userRightSet = this._public;
        }

        userRightSet && userRightSet.addPermission(RightSet.webdavStringToConstant(line.privilege));
      }, this);

      invite.forEach(function(line) {
        var userId, match = line.principal && line.principal.match(principalRegexp);

        if (match) {
          userId = match[1];
          this._getUserSet(userId).addPermission(RightSet.calendarShareeIntToConstant(line.access));
          this._userEmails[userId] = calendarUtils.removeMailto(line.href);
        }
      }, this);
    }

    CalendarRightShell.prototype._getUserSet = function(userId) {
      this._userRight[userId] = this._userRight[userId] || new RightSet();

      return this._userRight[userId];
    };

    CalendarRightShell.prototype.getUserRight = function(userId) {
      var rightSet = this._userRight[userId];

      return rightSet && sumupRight(rightSet);
    };

    CalendarRightShell.prototype.getAllUserRight = function() {
      return _.map(this._userRight, function(rightSet, userId) {
        return {
          userId: userId,
          right: sumupRight(rightSet)
        };
      });
    };

    CalendarRightShell.prototype.getPublicRight = function() {
      return sumupRight(this._public);
    };

    CalendarRightShell.prototype.update = function(userId, userEmail, newRole) {
      this._userEmails[userId] = userEmail;
      this._getUserSet(userId).addPermissions(matrix[newRole].shouldHave);
      this._getUserSet(userId).removePermissions(matrix[newRole].shouldNotHave);
    };

    CalendarRightShell.prototype.toDAVShareRights = function() {
      var result = {
        share: {
          set: []
        }
      };
      _.forEach(this._userRight, function(rightSet, userId) {
        if (rightSet.hasPermission([RightSet.SHAREE_READ])) {
          result.share.set.push({
            'dav:href': this._userEmails[userId],
            'dav:read': true
          });
        } else if (rightSet.hasPermission([RightSet.SHAREE_READWRITE])) {
          result.share.set.push({
            'dav:href': this._userEmails[userId],
            'dav:read-write': true
          });
        }
      }, this);
    };

    return CalendarRightShell;
  });