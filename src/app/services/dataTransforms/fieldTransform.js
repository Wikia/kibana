define([
  'angular',
  'lodash'
],
  function(ng, _) {
    ng.module('kibana.services').service('fieldTransform', function(dataTransform) {
      this.transform = function(results, search, fieldName, returnIndex, matchAgainst) {
        var regex = dataTransform.parseRegex(search),
          returnIndex = returnIndex || 0,
          matchAgainst = matchAgainst || '@message',
          matches;

        _.forEach(results.hits, function(hit) {
          matches = hit._source[matchAgainst].match(regex);

          if (matches != null) {
            hit._source[fieldName] = matches[returnIndex];
          }
        });

        return results.hits;
      };
    });
  }
);