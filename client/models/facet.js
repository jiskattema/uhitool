var AmpersandModel = require('ampersand-model');
var categoryItemCollection = require('../models/categoryitem-collection');

var math = require('mathjs');
var d3 = require('d3');
var dc = require('dc');
var util = require('../util');

// General functionality
// 
//   value  function that returns the value associated with the facet, for a specific data object
//   group  function that returns the group containing the data object 
//          implemented as a d3.scale object 

// For plotting with dc, to be passed directly to the chart:
//
//   x         a d3.scale object containing [min,max], linear/log etc. for chart.x()
//   xUnits    for counting number of groups in a range, for chart.xUnits()


var xUnitsFn = function (facet) {
    if (facet.displayContinuous) {
        return function(start, end, domain) {
            return d3.bisect(facet.group.domain(), end) - d3.bisect(facet.group.domain(), start);
        };
    }
    else if (facet.displayCategorial) {
        return dc.units.ordinal;
    }
    else {
        console.log( "xUnitsFn not implemented for: ", facet.type, facet.kind);
    }
};

var xFn = function (facet) {
    if (facet.displayContinuous) {
        if (facet.isLog) {
            return d3.scale.log().domain([facet.minval, facet.maxval]);
        }
        else {
            return d3.scale.linear().domain([facet.minval, facet.maxval]);
        }
    }
    else if (facet.displayCategorial) {

        var domain = [];

        facet.categories.forEach(function(cat) {
            domain.push(cat.group);
        }); 
        domain.sort();

        return d3.scale.ordinal().domain(domain);
    }
    else {
        console.log( "xFn not implemented for: ", facet.type, facet.kind);
    }
};

// Base value for given facet
var facetBaseValueFn = function (facet) {

    var accessor;
    if(facet.isProperty) {
        accessor = function (d) {
            var value = util.misval;
            if (d.hasOwnProperty(facet.accessor)) {
                value = d[facet.accessor];
            }
            if(facet.misval.indexOf(value) > -1) {
                return util.misval;
            }
            return value;
        };
    }
    else if(facet.isMath) {
        var formula = math.compile(facet.accessor);

        accessor = function (d) {
            try {
                var value = formula.eval(d);
                return value;
            } catch (e) {
                return util.misval;
            }
        };
    }

    if(facet.isContinuous || facet.isCategorial) {
        return accessor;
    }
    else {
        console.log("Facet kind not implemented in facetBaseValueFn: ", facet );
    }
};

var continuousFacetValueFn = function (facet) {
    var bin, scale;
    var range = [];
    var domain = [];

    // get base value function
    var baseValFn = facetBaseValueFn(facet);

    return function (d) {
        var val = parseFloat(baseValFn(d));
        if (isNaN(val) || val == Infinity || val == -Infinity) {
            return util.misval;
        }
        return val;
    };
};

var categorialFacetValueFn = function (facet) {

    // get base value function
    var baseValFn = facetBaseValueFn(facet);

    // Map categories to a set of user defined categories 
    return function (d) {
        var hay = baseValFn(d);

        // default to the raw value
        var val = hay;

        // Parse facet.categories to match against category_regexp to find group
        facet.categories.some(function (cat) {
            if(cat.category_regexp.test(hay)) {
                val = cat.group;
                return true;
            }
            else {
                return false;
            }
        });
        return val;
    };
};


// Create a function that returns the transformed value for this facet
var facetValueFn = function (facet) {

    if (facet.isContinuous) 
        return continuousFacetValueFn(facet);

    else if (facet.isCategorial) 
        return categorialFacetValueFn(facet);

    else {
        console.log( "facetValueFn not implemented for facet type: ", facet );
        return null;
    }
}; 



var continuousGroupFn = function (facet) {
    var range = [];
    var domain = [];
    var scale;
    var bin, x0, x1, size;

    var param = facet.grouping_continuous_bins;

    // A fixed number of equally sized bins, labeled by center value
    // param: number of bins
    if(facet.groupFixedN) {
        param = param < 0 ? -param : param;

        x0 = facet.minval;
        x1 = facet.maxval;
        size = (x1 - x0) / param;

        // Smaller than x0
        range.push(util.misval);

        bin = 0;
        while(bin < param) {
            domain.push(x0 + bin*size);
            range.push(x0 + (bin+0.5) * size);
            bin=bin+1;
        }

        // Larger than x1
        range.push(util.misval);
        domain.push(x1);

        scale = d3.scale .threshold() .domain(domain) .range(range);
    }

    // A fixed bin size, labeled by center value
    // param: bin size
    else if (facet.groupFixedS) {
        param = param < 0 ? -param : param;

        bin = Math.floor(facet.minval/param);
        while(bin * param < facet.maxval) {
            domain.push(bin*param);
            range.push((bin+0.5) * param);
            bin=bin+1;
        }
        domain.push(bin*param);
        scale = d3.scale .threshold() .domain(domain) .range(range);
    }

    // A fixed bin size, centered on 0, labeled by center value
    // param: bin size
    else if (facet.groupFixedSC) {
        param = param < 0 ? -param : param;

        bin = Math.floor(facet.minval/param);
        while( bin * param < facet.maxval) {
            domain.push((bin-0.5)*param);
            range.push(bin*param);
            bin=bin+1;
        }
        domain.push(bin*param);
        scale = d3.scale .threshold() .domain(domain) .range(range);
    }


    // Logarithmically (base 10) sized bins, labeled by higher value
    // param: number of bins
    else if (facet.groupLog) {
        param = param <= 0 ? 1.0 : param;

        x0 = Math.floor(Math.log(facet.minval)/Math.log(10.0));
        x1 = Math.ceil(Math.log(facet.maxval)/Math.log(10.0));
        size = (x1 - x0) / param;

        bin = 0;
        while(bin < param) {
            domain.push(Math.exp((x0 + bin*size) * Math.log(10.0)));
            range.push (Math.exp((x0 + (bin+0.5) * size) * Math.log(10.0)));
            bin=bin+1;
        }
        domain.push(Math.exp(x1 * Math.log(10.0)));
        scale = d3.scale .threshold() .domain(domain) .range(range);
    }
    else {
        console.log( "Grouping not implemented for facet", facet);
    }

    return scale;
};


var categorialGroupFn = function (facet) {
    // Don't do any grouping; that is done in the step from base value to value.
    // Matching of facet value and group could lead to a different ordering,
    // which is not allowed by crossfilter
    return function (d) {return d;};
};


var facetGroupFn = function (facet) {
    if(facet.displayContinuous)
        return continuousGroupFn(facet);
    else if (facet.displayCategorial)
        return categorialGroupFn(facet);
    else {
        console.log("Group function not implemented for facet", facet);
    }
};


module.exports = AmpersandModel.extend({
    props: {
        show: [ 'boolean', false, true ],
        active: [ 'boolean', false, false ],

        // general facet properties
        description: ['string', true, ''], // data-hook: general-description-input
        units: ['string', true, ''],       // data-hook: general-units-input
        name: ['string', true, ''],        // data-hook: general-title-input

        // properties for type
        type: {type:'string', required: true, default: 'continuous', values: ['continuous', 'categorial']},

        // properties for base-value-general
        accessor: ['string',false,null], // property or mathjs string
        bccessor: ['string',false,null], // property or mathjs string
        misval_astext: ['string', true, 'Infinity'],
        kind: {type:'string', required:true, default: 'property', values: ['property', 'math']},

        // properties for grouping-general
        minval_astext: ['string', true, '0'],   // data-hook: grouping-general-minimum
        maxval_astext: ['string', true, '100'], // data-hook: grouping-general-maximum

        // properties for grouping-continuous
        grouping_continuous_bins: ['number', true, 20 ],
        grouping_continuous:      {type: 'string', required: true, default: 'fixedn', values: ['fixedn', 'fixedsc', 'fixeds', 'log']},

        // properties for reduction
        reduction: {type:'string', required: true, default: 'count', values: ['count', 'sum', 'average']},
        reduction_type: {type:'string', required: true, default: 'absolute', values: ['absolute', 'percentage']},
    },

    collections: {
        // categoryItemCollection containing regular expressions for the mapping of facetValue to category
        categories: categoryItemCollection,
    },

    derived: {

        // properties for: type
        isContinuous: {
            deps: ['type'],
            fn: function () {
                return this.type == 'continuous';
            },
            cache: false,
        },
        isCategorial: {
            deps: ['type'],
            fn: function () {
                return this.type == 'categorial';
            },
            cache: false,
        },


        // determine actual type from type + transform
        displayType: {
            deps: ['type'],
            fn: function () {

                return this.type;
            },
            cache: false,
        },
        displayContinuous: {
            deps: ['displayType'],
            fn: function () {
                return this.displayType == 'continuous';
            },
            cache: false,
        },
        displayCategorial: {
            deps: ['displayType'],
            fn: function () {
                return this.displayType == 'categorial';
            },
            cache: false,
        },

        // properties for: base-value
        misval: {
            deps: ['misval_astext'],
            fn: function () {
                // Parse the text content as a JSON array:
                //  - strings should be quoted
                //  - numbers unquoated
                //  - special numbers not allowed: NaN, Infinity
                try {
                    return JSON.parse('[' + this.misval_astext + ']');
                } catch (e) {
                    return ["Missing"];
                }
            },
        },
        isProperty: {
            deps: ['kind'],
            fn: function () {
                return this.kind == 'property';
            },
            cache: false,
        },
        isMath: {
            deps: ['kind'],
            fn: function () {
                return this.kind == 'math';
            },
            cache: false,
        },

        // properties for grouping-general
        minval: {
            deps: ['minval_astext'],
            fn: function () {
                return parseFloat(this.minval_astext); // FIXME: use proper accessor instead of parseFloat
            }
        },
        maxval: {
            deps: ['maxval_astext'],
            fn: function () {
                return parseFloat(this.maxval_astext); // FIXME: use proper accessor instead of parseFloat
            }
        },

        // properties for grouping-continuous
        groupFixedN: {
            deps: ['grouping_continuous'],
            fn: function () {
                return this.grouping_continuous == 'fixedn';
            }
        },
        groupFixedSC: {
            deps: ['grouping_continuous'],
            fn: function () {
                return this.grouping_continuous == 'fixedsc';
            }
        },
        groupFixedS: {
            deps: ['grouping_continuous'],
            fn: function () {
                return this.grouping_continuous == 'fixeds';
            }
        },
        groupLog: {
            deps: ['grouping_continuous'],
            fn: function () {
                return this.grouping_continuous == 'log';
            }
        },

        // properties for reduction
        reduceCount: {
            deps: ['reduction'],
            fn: function () {
                return this.reduction == 'count';
            }
        },
        reduceSum: {
            deps: ['reduction'],
            fn: function () {
                return this.reduction == 'sum';
            }
        },
        reduceAverage: {
            deps: ['reduction'],
            fn: function () {
                return this.reduction === 'average';
            }
        },
        reduceAbsolute: {
            deps: ['reduction_type'],
            fn: function () {
                return this.reduction_type === 'absolute';
            }
        },
        reducePercentage: {
            deps: ['reduction_type'],
            fn: function () {
                return this.reduction_type === 'percentage';
            }
        },


        // Complex methods on the facet
        basevalue: {
            deps: ['type','accessor', 'bccessor', 'misval', 'kind'],
            fn: function () {
                return facetBaseValueFn(this);
            },
            cache: false,
        },
        value: {
            deps: ['type', 'basevalue'],
            fn: function () {
                return facetValueFn(this);
            },
            cache: false,
        },
        group: {
            deps: ['value','displayType','grouping_continuous_bins','grouping_continuous'],
            fn: function () {
                return facetGroupFn(this);
            },
            cache: false,
        },
        x: {
            deps: ['group','displayType'],
            fn: function () {
                return xFn(this);
            },
            cache: false,
        },
        xUnits: {
            deps: ['group', 'displayType'],
            fn: function () {
                return xUnitsFn(this);
            },
            cache: false,
        },
    },

    // Session properties are not typically be persisted to the server, 
    // and are not returned by calls to toJSON() or serialize().
    session: {
        modelType: ['string',true,'facet'], // Checked when setting widget.primary etc.
    },
});
