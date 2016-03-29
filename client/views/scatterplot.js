var app = require('ampersand-app');
var ContentView = require('./widget-content');
var templates = require('../templates');
var util = require('../util');
var dc = require('dc');
var d3 = require('d3');

module.exports = ContentView.extend({
    template: templates.includes.scatterplot,
    bindings: {
    },
    renderContent: function() {
        var x = parseInt(0.8 * this.el.offsetWidth);
        var y = parseInt(x);

        // dont do anything without a facet defined
        if(! this.model.isReady) {
            return;
        }

        delete this._chart;

        // FIXME: crossfilter access
        if(this._crossfilter) {
            this.cleanup();
        }
        this._crossfilter = util.dxGlue2d(this.model.primary, this.model.secondary);
        var that = this; // used in callback for chart and crossfilter

        // We need to wrap the default group to deal with missing values:
        // missing values are set equal to util.misval (typically Number.MAX_VAL), 
        // and will lead to out-of-range errors when rendering, and the rendering aborts on error.
        // Set the missing values to just smaller than the minimum value.
        var wrapped_group = {
            all: function () {
                var all = that._crossfilter.group.all();
                all.forEach(function(currentValue, index, array) {
                    if( currentValue.key[0] == util.misval ) {
                        currentValue.key[0] = that.model.primary.minval - 1.0;
                    }
                    if( currentValue.key[1] == util.misval ) {
                        currentValue.key[1] = that.model.secondary.minval - 1.0;
                    }
                    // dont plot empty groups
                    if( currentValue.value.count === 0) {
                        currentValue.key[1] = that.model.secondary.minval - 1.0;
                    }
                });
                return all;
            }
        };

        // Options:
        // mouseZoomable : does not work well in comibination when using a trackpad
        // elasticX : when set to true, and the data contains Infinity, goes bonkers.
        var chart = dc.scatterPlot(this.queryByHook('scatterplot'));
        chart
            .margins({top: 10, right: 10, bottom: 30, left: 100})
            .brushOn(true)
            .mouseZoomable(false)
            .elasticX(false)
            .elasticY(false)
            .x(this.model.primary.x)
            .y(this.model.secondary.x)
            .transitionDuration(app.me.anim_speed)
            .dimension(this._crossfilter.dimension)
            .group(wrapped_group)
            .on('filtered', function(chart) {
                // RangedTwoDimensionalFilter [[xmin,ymin], [xmax,ymax]]
                if(chart.hasFilter()) {
                    // update the model
                    that.model.range = chart.filters()[0]; 
                }
                else {
                    that.model.range = undefined;
                }
            });

        // Apply filter settings
        if(this.model.range) {
            chart.filter(this.model.range);
        }

        // keep a handle on the chart, will be cleaned up by the widget-content base class.
        chart.render();
        this._chart = chart;
    },

    cleanup: function () {
        if (this._crossfilter) {
            this._crossfilter.dimension.filterAll();
            this._crossfilter.dimension.dispose();
            delete this._crossfilter.dimension;
        }
    },
});
