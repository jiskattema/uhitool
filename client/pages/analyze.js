var app = require('ampersand-app');
var View = require('ampersand-view');
var PageView = require('./base');
var templates = require('../templates');
var widgetFrameView = require('../views/widget-frame');

var dc = require('dc');

var widgetSelectorItemView = View.extend({
    template: templates.includes.widgetselectoritem,
    bindings: {
        'model.modelType': {
            type: 'text',
            hook: 'item'
        },
    },
    events: {
        'click [data-hook~=item]':    'handleClick',
    },
    handleClick:  function () {
        // Create a new widgetModel, and keep a reference to it
        var m = app.widgetFactory.newModel({'modelType': this.model.modelType});

        this.parent.collection.add( m );

        // Create a view for it, and render it
        var v = new widgetFrameView({'model': m});
        this.parent.renderSubview(v, this.parent.queryByHook('widgets'));

        // And render it's content
        if (v.renderContent) {
            v.renderContent.call(v);
        }

        // Update all dynamic MLD javascript things
        window.componentHandler.upgradeDom();
    },
});

module.exports = PageView.extend({
    pageTitle: 'more info',
    template: templates.pages.analyze,

    render: function() {
        this.renderWithTemplate(this);
        this.renderCollection(app.widgetFactory.widgets,
                              widgetSelectorItemView,
                              this.queryByHook('widget-selector'));

        // Create views for each widget, and render it
        this.collection.forEach(function(m) {
            var v = new widgetFrameView({'model': m});
            this.renderSubview(v, this.queryByHook('widgets'));
        }, this);

        return this;
    },

    renderContent: function () {
        this._subviews.forEach( function(v) {
            if (v.renderContent) {
                v.renderContent.call(v);
            }
        });

        // make sure all widgets are in sync
        dc.redrawAll();
    },
});
