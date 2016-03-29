var ContentView = require('./widget-content');
var templates = require('../templates');
var app = require('ampersand-app');
var util = require('../util');

var ol = require('openlayers');
var chroma = require('chroma-js');


var vector = new ol.layer.Vector({
    source: new ol.source.Vector({
        url: 'data/topo.json',
        format: new ol.format.TopoJSON()
    }),
    style: [new ol.style.Style({fill: new ol.style.Fill({color: [0,0,0,0]})})],
});

var map = new ol.Map({
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM()
        }),
        vector
    ],
    view: new ol.View({
        center: [622293.2805652852, 6835614.194719033],
        zoom: 8
    })
});

var recalculateColors = function (view) {
    var records, r;
    var idToColor = {}; // keys -> model.id, values -> rgb value

    // Color by facet value
    if(view.model && view.model.tertiary) {
        records = util.dxDataGet();
        var scale = chroma.scale( chroma.brewer.YlOrRd );

        var min = view.model.tertiary.minval;
        var max = view.model.tertiary.maxval;

        // Find range [min, max]
        var valueFn = view.model.tertiary.value;
        for(r=0; r < records.length; r++) {
            var value = valueFn(records[r]);
            if (value != Infinity ) {
                idToColor[records[r].gid] = value;  // FIXME properly deal with record ID name, here gid
            }
        } 

        // Normalize to [0,1] and color it
        var norm = 1.0 * (max - min);

        // Update the view
        view.model.min = min;
        view.model.max = max;
        view.model.total = Object.keys(idToColor).length;

        for(var key in idToColor) {
            idToColor[key] = scale((idToColor[key] - min) / norm)._rgb;
        }
    }
    else {
        // create temporary dimension on 'gid'
        var _dx = app.crossfilter.dimension(function(d){return d.gid;});
        records = _dx.top(Infinity);
        for(r=0; r < records.length; r++) {
            idToColor[records[r].gid] = [0.5, 0.5, 0.5, 1.0];  // FIXME properly deal with record ID name, here gid
        }
        _dx.dispose();
    }

    vector.getSource().forEachFeature(function(f) {
        var style;
        var id = f.getId();

        if(id in idToColor) {
            style = [new ol.style.Style({
                fill: new ol.style.Fill({color: idToColor[f.getId()]}),
            })];
        }
        else {
            style = [new ol.style.Style({
                fill: new ol.style.Fill({color: [0,0,0,0]}),
            })];
        }
        f.setStyle(style);
        f.changed();
    });
};

module.exports = ContentView.extend({
    template: templates.includes.heatmap,
    bindings: {
        'model.min': {
            type: 'text',
            hook: 'min'
        },
        'model.max': {
            type: 'text',
            hook: 'max'
        },
        'model.total': {
            type: 'text',
            hook: 'total'
        },
        'model.alpha': {
            type: 'value',
            hook: 'alpha',
        },
    },

    renderContent: function () {
        var x = parseInt(0.8 * this.el.offsetWidth);
        var y = parseInt(x);

        this.queryByHook('alpha').value = this.model.alpha;
        map.setTarget(this.queryByHook('heatmap'));
        map.setSize([x,y]);

        // To set the correct style for the vectors, we need to iterate over the source,
        // but we can only iterate over the vector source once it is fully loaded.
        // When the vector layer emits a 'render' signal seems to work
        vector.once("render", function () {
            recalculateColors(this);
        });
    },

    redraw: function () {
        recalculateColors(this);
    },

    events: {
        'change [data-hook~=alpha]': 'handleSlider',
    },

    handleSlider: function () {
        this.model.alpha = parseInt(this.queryByHook('alpha').value) ;
        vector.setOpacity(  this.model.alpha * 0.01 );
    },
    changedTertiary: function () {
        recalculateColors(this);
    },
});
