define([
  'angular',
  'lodash'
],
  function(ng, _) {
    ng.module('kibana.services').service('sumTransform', function(dataTransform) {
      this.transform = function(results, fieldName, as) {
        var sum = 0, as = as || null;
        _.forEach(results.hits, function(hit) {
          var field = parseFloat(dataTransform.getField(hit, fieldName));

          if (_.isNumber(field)) {
            sum += field;
          }
        });

        return [as, sum];
      };
    });
  }
);