define([
  'angular',
  'underscore'
],
  function(ng, _) {
    "use strict";

    ng.module('kibana.services').service('meanTransform', function(dataTransform) {
      this.transform = function(results, fieldName, upperBound, lowerBound, precision, as) {
        var i,
            sum = 0,
            mean,
            sortedData = _.clone(results.hits),
            dataLength = sortedData.length,
            field,
            divisor,
            operand;

        upperBound = upperBound || 1;
        lowerBound = lowerBound || 0;
        precision = precision || 0;
        as = as || null;

        dataTransform.sort(sortedData, function(hit) {
          return dataTransform.getField(hit, fieldName);
        });

        // start and stop point in loop
        upperBound = Math.floor(upperBound * dataLength);
        lowerBound = Math.ceil(lowerBound * dataLength);

        for (i = lowerBound; i < upperBound; i++) {
          field = parseFloat(dataTransform.getField(sortedData[i], fieldName));

          if (_.isNumber(field)) {
            sum += field;
          }
        }

        precision = Math.pow(10, precision);
        divisor = upperBound - lowerBound;
        operand = divisor !== 0 ? sum / divisor : sum;
        mean = Math.round(operand * precision) / precision;

        return [as, mean];
      };
    });
  }
);
