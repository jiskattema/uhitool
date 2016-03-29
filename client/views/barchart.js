var app = require('ampersand-app');
var ContentView = require('./widget-content');
var templates = require('../templates');
var util = require('../util');
var dc = require('dc');
var d3 = require('d3');

module.exports = ContentView.extend({
    template: templates.includes.barchart,

    cleanup: function () {
        if (this._crossfilter) {
            this._crossfilter.dimension.filterAll();
            this._crossfilter.dimension.dispose();
            delete this._crossfilter.dimension;
        }
    },
    renderContent: function() {
        var x = parseInt(0.8 * this.el.offsetWidth);
        var y = parseInt(x);

        // dont do anything without a facet defined
        if(! this.model.primary) {
            return;
        }
        if(this._crossfilter) {
            this.cleanup();
        }

        // tear down existing stuff
        delete this._chart;

        // Options:
        // mouseZoomable : does not work well in comibination when using a trackpad
        var chart = dc.barChart(this.queryByHook('barchart'));
        var that = this; // used in callback
        chart
            .margins({top: 10, right: 10, bottom: 30, left: 100})
            .outerPadding(1.0)
            .brushOn(true)
            .mouseZoomable(false)
            .elasticX(false)
            .elasticY(true)

            .xUnits(this.model.primary.xUnits)
            .x(this.model.primary.x)

            .transitionDuration(app.me.anim_speed)
            .on('filtered', function(chart) {
                if(chart.hasFilter()) {
                    // Filter is an Array[n] of: selected keys, or a single filtered range [xmin,xmax]
                    that.model.range = chart.filters();
                }
                else {
                    that.model.range = undefined;
                }
            });

        // Stacked barchart
        if(this.model.secondary && this.model.secondary.displayCategorial) {

            this._crossfilter = util.dxGlueAbyCatB(this.model.primary, this.model.secondary, this.model.tertiary);
            var domain = this.model.secondary.x.domain();

            // NOTE: we need generator functions because of the peculiar javascript scoping rules in loops, 
            //       and 'let' instead of 'var' not being supported yet in my browser
            var stackFn;

            if (this.model.secondary.reducePercentage) {
                stackFn = function (i) {
                    return function (d) {return 100 * d.value[domain[i]] / d.value._total;};
                };
            }
            else if (this.model.secondary.reduceAbsolute) {
               stackFn = function (i) {
                    return function (d) {return d.value[domain[i]];};
                };
            }
            else {
                console.log( "barchart: Reduction not supported for facet", this.model.secondary.reduction, this.model.secondary);
            }

            chart
                .hidableStacks(false)  // FIXME: unexplained crashed when true, and a category is selected from the legend
                .dimension(this._crossfilter.dimension)
                .group(this._crossfilter.group, domain[0])
                .valueAccessor(stackFn(0));

            for(var i=1; i < domain.length; i++) {
                chart.stack(this._crossfilter.group, domain[i], stackFn(i));
            }

            chart.legend(dc.legend().x(100).y(0).itemHeight(13).gap(5));
        }

        // Regular barchart, if secondary is falsy
        // Else, group by facetA, take value of facetB
        else {
            this._crossfilter = util.dxGlue1d(this.model.primary, this.model.secondary);

            chart
                .dimension(this._crossfilter.dimension)
                .group(this._crossfilter.group)
                .valueAccessor(this._crossfilter.valueAccessor);
        }

        // Center for continuous, don't for ordinal plots
        chart.centerBar(! chart.isOrdinal());

        // Apply filter settings
        if(this.model.range) {
            this.model.range.forEach(function(f) {
                chart.filter(f);
            });
        }

        chart.render();
 
        this._chart = chart;
    },
});
