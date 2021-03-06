/** @scratch /panels/5
 *
 * include::panels/hits.asciidoc[]
 */

/** @scratch /panels/hits/0
 *
 * == Hits
 * Status: *Stable*
 *
 * The hits panel displays the number of hits for each of the queries on the dashboard in a
 * configurable format specified by the `chart' property.
 *
 */
define([
  'angular',
  'app',
  'lodash',
  'jquery',
  'kbn',

  'jquery.flot',
  'jquery.flot.pie',
  'jquery.scrollTo'
], function (angular, app, _, $, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.hits', []);
  app.useModule(module);

  module.controller('hits', function($scope, querySrv, dashboard, filterSrv, rowService, dataTransform) {
    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      editorTabs : [
        {title:'Queries', src:'app/partials/querySelect.html'}
      ],
      status  : "Stable",
      description : "The total hits for a query or set of queries. Can be a pie chart, bar chart, "+
        "list, or absolute total of all queries combined"
    };

    // Set and populate defaults
    var _d = {
      style   : { 
        "font-size": '10pt',
        "text-align": 'center'
      },
      /** @scratch /panels/hits/3
       *
       * === Parameters
       *
       * arrangement:: The arrangement of the legend. horizontal or vertical
       */
      arrangement : 'horizontal',
      /** @scratch /panels/hits/3
       * chart:: bar, pie or none
       */
      chart       : 'bar',
      /** @scratch /panels/hits/3
       * counter_pos:: The position of the legend, above or below
       */
      counter_pos : 'above',
      /** @scratch /panels/hits/3
       * donut:: If the chart is set to pie, setting donut to true will draw a hole in the midle of it
       */
      donut   : false,
      /** @scratch /panels/hits/3
       * tilt:: If the chart is set to pie, setting tilt to true will tilt it back into an oval
       */
      tilt    : false,
      /** @scratch /panels/hits/3
       * labels:: If the chart is set to pie, setting labels to true will draw labels in the slices
       */
      labels  : true,
      /** @scratch /panels/hits/3
       * spyable:: Setting spyable to false disables the inspect icon.
       */
      spyable : true,
      /** @scratch /panels/hits/5
       *
       * ==== Queries
       * queries object:: This object describes the queries to use on this panel.
       * queries.mode::: Of the queries available, which to use. Options: +all, pinned, unpinned, selected+
       * queries.ids::: In +selected+ mode, which query ids are selected.
       */
      queries     : {
        mode        : 'all',
        ids         : []
      },
      pairedWith: '-1',
      threshold: {
        warning: 0,
        critical: 0
      },
      calc: {
        display: '-1',
        sample_size: 500
      }
    };
    _.defaults($scope.panel,_d);

    $scope.init = function () {
      $scope.hits = 0;

      $scope.$on('refresh',function(){
        $scope.get_data();
      });
      $scope.get_data();

    };

    $scope.get_data = function(segment,query_id) {
      delete $scope.panel.error;
      $scope.panelMeta.loading = true;

      // Make sure we have everything for the request to complete
      if(dashboard.indices.length === 0) {
        return;
      }

      var _segment = _.isUndefined(segment) ? 0 : segment;
      var request = $scope.ejs.Request().indices(dashboard.indices[_segment]);
      var requestGenerator, resultProcessor;

      if ($scope.panel.calc.display != -1) {
        requestGenerator = getCalcReq;
        resultProcessor = getCalcProcessor;
      } else {
        requestGenerator = getFacetReq;
        resultProcessor = getFacetProcessor;
      }

      $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
      var queries = querySrv.getQueryObjs($scope.panel.queries.ids);

      // Build the question part of the query
      request = requestGenerator(request, queries);


      // Populate the inspector panel
      $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);

      // Then run it
      var results = request.doSearch();

      // Populate scope when we have results
      results.then(function(results) {
        $scope.panelMeta.loading = false;
        if(_segment === 0) {
          $scope.hits = 0;
          $scope.data = [];
          query_id = $scope.query_id = new Date().getTime();
        }

        // Check for error and abort if found
        if(!(_.isUndefined(results.error))) {
          $scope.panel.error = $scope.parse_error(results.error);
          return;
        }

        // Make sure we're still on the same query/queries
        if($scope.query_id === query_id) {
          var isLastQuery = _segment == dashboard.indices.length - 1;

          resultProcessor(results, queries, _segment, isLastQuery);
          setColor();
          $scope.$emit('render');

          if(!isLastQuery) {
            $scope.get_data(_segment+1,query_id);
          }

        }
      });
    };

    $scope.getRows = function() {
      var list = {'-1': 'None'};

      _.each(dashboard.current.rows, function(row) {
        _.each(row.panels, function(panel, i) {
          var id = row.id+"."+i;
          var title = row.title+" > "+panel.title;

          list[id] = title;
        });
      });

      return list;
    };

    $scope.getCalcs = function() {
      var list = { '-1': 'None' },
        queries = querySrv.getQueryObjs(querySrv.idsByMode($scope.panel.queries)),
        validTransforms = querySrv.listTransforms('calc'),
        key, args;

      _.each(queries, function(query) {
        _.each(query.transforms, function(transform) {
          if (_.indexOf(validTransforms, transform.command) != -1) {
            key = dataTransform.transformToString(transform);
            list[key] = key;
          }
        });
      });

      return list;
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    var setColor = function() {
      var colors = {
        ok: 'darkgreen',
        warning: 'orange',
        critical: 'red'
      };

      if ($scope.panel.threshold.warning != 0 || $scope.panel.threshold.critical != 0) {
        var targetColor = colors.ok;

        if ($scope.panel.threshold.warning != 0 && $scope.hits > $scope.panel.threshold.warning) {
          targetColor = colors.warning;
        }

        if ($scope.panel.threshold.critical != 0 && $scope.hits > $scope.panel.threshold.critical) {
          targetColor = colors.critical;
        }

        $scope.panel.style.color = targetColor;
      }
    };

    var getFacetReq = function(request, queries) {
      _.each(queries, function(q) {
        var _q = $scope.ejs.FilteredQuery(
          querySrv.toEjsObj(q),
          filterSrv.getBoolFilter(filterSrv.ids));

        request = request
          .facet($scope.ejs.QueryFacet(q.id)
            .query(_q)
          ).size(0);
      });

      return request;
    };

    var getCalcReq = function(request, queries) {
      var boolQuery = $scope.ejs.BoolQuery();

      _.each(queries, function(q) {
        boolQuery = boolQuery.should(querySrv.toEjsObj(q));
      });

      return request
        .query($scope.ejs.FilteredQuery(boolQuery, filterSrv.getBoolFilter(filterSrv.ids)))
        .size($scope.panel.calc.sample_size);
    };

    var getFacetProcessor = function(results, queries, segment) {
      var i = 0;
      _.each(queries, function(q) {
        var v = results.facets[q.id];
        var hits = _.isUndefined($scope.data[i]) || segment === 0 ?
          v.count : $scope.data[i].hits+v.count;
        $scope.hits += v.count;

        // Create series
        $scope.data[i] = {
          info: q,
          id: q.id,
          hits: hits,
          data: [[i,hits]]
        };

        i++;
      });
    };

    var getCalcProcessor = function(results, queries, segment, isLastQueryResult) {
      _.each(queries, function(q, i) {
        $scope.data[i] = $scope.data[i] || {
          info: q,
          id: q.id,
          hits: 0,
          results: {
            hits: {
              hits: []
            }
          }
        };

        $scope.data[i].results.hits.hits.push(results.hits.hits);
        $scope.data[i].hits += results.hits.total;

        if (isLastQueryResult) {
          $scope.data[i].results.hits.hits = _.flatten($scope.data[i].results.hits.hits, true);
          var transformedResults = dataTransform.transform([q], $scope.data[i].results);
          if (_.has(transformedResults.hits, 'calc') && _.has(transformedResults.hits.calc, $scope.panel.calc.display)) {
            $scope.hits = transformedResults.hits.calc[$scope.panel.calc.display].value;
          } else {
            $scope.hits = 0;
          }
        }
      });
    };
  });


  module.directive('hitsChart', function(querySrv) {
    return {
      restrict: 'A',
      link: function(scope, elem) {

        // Receive render events
        scope.$on('render',function(){
          render_panel();
        });

        // Re-render if the window is resized
        angular.element(window).bind('resize', function(){
          render_panel();
        });

        // Function for rendering panel
        function render_panel() {
          // IE doesn't work without this
          elem.css({height:scope.row.height});

          try {
            _.each(scope.data,function(series) {
              series.label = series.info.alias;
              series.color = series.info.color;
            });
          } catch(e) {return;}

          // Populate element
          try {
            // Add plot to scope so we can build out own legend
            if(scope.panel.chart === 'bar') {
              scope.plot = $.plot(elem, scope.data, {
                legend: { show: false },
                series: {
                  lines:  { show: false, },
                  bars:   { show: true,  fill: 1, barWidth: 0.8, horizontal: false },
                  shadowSize: 1
                },
                yaxis: { show: true, min: 0, color: "#c8c8c8" },
                xaxis: { show: false },
                grid: {
                  borderWidth: 0,
                  borderColor: '#eee',
                  color: "#eee",
                  hoverable: true,
                },
                colors: querySrv.colors
              });
            }
            if(scope.panel.chart === 'pie') {
              scope.plot = $.plot(elem, scope.data, {
                legend: { show: false },
                series: {
                  pie: {
                    innerRadius: scope.panel.donut ? 0.4 : 0,
                    tilt: scope.panel.tilt ? 0.45 : 1,
                    radius: 1,
                    show: true,
                    combine: {
                      color: '#999',
                      label: 'The Rest'
                    },
                    stroke: {
                      width: 0
                    },
                    label: {
                      show: scope.panel.labels,
                      radius: 2/3,
                      formatter: function(label, series){
                        return '<div ng-click="build_search(panel.query.field,\''+label+'\')'+
                          ' "style="font-size:8pt;text-align:center;padding:2px;color:white;">'+
                          label+'<br/>'+Math.round(series.percent)+'%</div>';
                      },
                      threshold: 0.1
                    }
                  }
                },
                //grid: { hoverable: true, clickable: true },
                grid:   { hoverable: true, clickable: true },
                colors: querySrv.colors
              });
            }
          } catch(e) {
            elem.text(e);
          }
        }

        var $tooltip = $('<div>');
        elem.bind("plothover", function (event, pos, item) {
          if (item) {
            var value = scope.panel.chart === 'bar' ?
              item.datapoint[1] : item.datapoint[1][0][1];
            $tooltip
              .html(kbn.query_color_dot(item.series.color, 20) + ' ' + item.series.label + " (" + value.toFixed(0) + ")")
              .place_tt(pos.pageX, pos.pageY);
          } else {
            $tooltip.remove();
          }
        });

      }
    };
  });

  module.directive('hitsTotal', function(dashboard, rowService) {
    return {
      restrict: 'A',
      link: function(scope, e) {
        e.click(function() {
          if (scope.panel.pairedWith == -1) {
            return;
          }

          var pairedRowId = scope.panel.pairedWith.split('.')[0];
          var row = rowService.getRow(pairedRowId);

          if (row != null) {
            var cb = function() {
              $.scrollTo($('#'+rowService.idPrefix()+pairedRowId));
            };

            if (rowService.show(row, scope)) {
              cb();
              setTimeout(cb, 250);
            } else {
              cb();
            }
          }
        });
      }
    }
  })
});