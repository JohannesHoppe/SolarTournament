/*
 * The .bind method from Prototype.js
 * 
 * Helper to preserve the context of "this"
 * it's now part of the recently released ECMAScript 5th Edition Specification
 * 
 * Example:
 * MyClass.prototype.myfunc = function() {
 * 
 *   this.element.click((function() {
 *      // ...
 *   }).bind(this));
 * };
 * see: http://stackoverflow.com/questions/2025789/preserving-a-reference-to-this-in-javascript-prototype-functions 
 */
if (!Function.prototype.bind) { // check if native implementation available
    
    Function.prototype.bind = function () {
        
        var fn = this, args = Array.prototype.slice.call(arguments),
        object = args.shift();
        
        return function () {
            return fn.apply(object, args.concat(Array.prototype.slice.call(arguments)));
        };
    };
}

/* 
 * Simple JavaScript Inheritance
 * By John Resig http://ejohn.org/
 * MIT Licensed.
 *
 * Inspired by base2 and Prototype
 * see: http://ejohn.org/blog/simple-javascript-inheritance/ 
 * 
 *   Example:
 *        
 *         var Person = Class.extend({
 *             init: function (isDancing) {
 *                 this.dancing = isDancing;
 *             },
 *             dance: function () {
 *                 return this.dancing;
 *             }
 *         });
 *         var Ninja = Person.extend({
 *             init: function () {
 *                 this._super(false);
 *             },
 *             dance: function () {
 *                 // Call the inherited version of dance()
 *                 return this._super();
 *             },
 *             swingSword: function () {
 *                 return true;
 *             }
 *         });
 * 
 *         var p = new Person(true);
 *         p.dance(); // => true
 * 
 *         var n = new Ninja();
 *         n.dance(); // => false
 *         n.swingSword(); // => true
 * 
 *         // Should all be true
 *         p instanceof Person && p instanceof Class &&
 *         n instanceof Ninja && n instanceof Person && n instanceof Class
 *
 */
(function () {
    var initializing = false, fnTest = /xyz/.test(function () { xyz; }) ? /\b_super\b/ : /.*/;
    // The base Class implementation (does nothing)
    this.Class = function () { };

    // Create a new Class that inherits from this class
    Class.extend = function (prop) {
        var _super = this.prototype;

        // Instantiate a base class (but only create the instance,
        // don't run the init constructor)
        initializing = true;
        var prototype = new this();
        initializing = false;

        // Copy the properties over onto the new prototype
        for (var name in prop) {
            // Check if we're overwriting an existing function
            prototype[name] = typeof prop[name] == "function" &&
        typeof _super[name] == "function" && fnTest.test(prop[name]) ?
        (function (name, fn) {
            return function () {
                var tmp = this._super;

                // Add a new ._super() method that is the same method
                // but on the super-class
                this._super = _super[name];

                // The method only need to be bound temporarily, so we
                // remove it when we're done executing
                var ret = fn.apply(this, arguments);
                this._super = tmp;

                return ret;
            };
        })(name, prop[name]) :
        prop[name];
        }

        // The dummy class constructor
        function Class() {
            // All construction is actually done in the init method
            if (!initializing && this.init)
                this.init.apply(this, arguments);
        }

        // Populate our constructed prototype object
        Class.prototype = prototype;

        // Enforce the constructor to be what we expect
        Class.prototype.constructor = Class;

        // And make this class extendable
        Class.extend = arguments.callee;

        return Class;
    };
})();


/*
 * I was bored to write:
 *
 *    var MyClass = function () {};
 *    MyClass.prototype.helloWorld = function () { }
 *    MyClass.prototype.test2 = function () { }
 *
 * Instead this is equivalent:
 *
 *    var MyClass = function () {};
 *    MyClass.addToProto({
 *        
 *        helloWorld = function () { },
 *        test2 = function () { }
 *    };
 *
 * Note: "prototype" is a property of constructors
 */
Function.prototype.addToProto = function (functionsToAdd) {

    for (var name in functionsToAdd) {

        var functionToAdd = functionsToAdd[name];

        if (typeof (functionToAdd) == "function") {
            this.prototype[name] = functionToAdd;
        }
    }
};

// conflicts with jQuery!
///*
// * Works the same way as addToProto,
// * but targets instances by using Object.getPrototypeOf
// *
// * Note: "__proto__" is a property of instances
// */
//Object.prototype.addToProtoOfInstance = function (functionsToAdd) {
//
//    var thePrototype = Object.getPrototypeOf(this);
//
//    for (var name in functionsToAdd) {
//
//        var functionToAdd = functionsToAdd[name];
//
//        if (typeof (functionToAdd) == "function") {
//            thePrototype[name] = functionToAdd;
//        }
//    }
//};


/* 
 * Picks the first element from an array that has the given id
 * Note: all elements must have an "id" property
 */
Array.prototype.getById = function (id) {

    for (var n = 0; n < this.length; n++) {
        
        var item = this[n];
        if (item.id == id) {
            return item;
        }
    }

    return null;
};

/* 
* Picks the first element from an array that has the given name
* Note: all elements must have an "name" property
*/
Array.prototype.getByName = function (name) {

    for (var n = 0; n < this.length; n++) {

        var item = this[n];
        if (item.name == name) {
            return item;
        }
    }

    return null;
};

/* 
 * Cross-Browser Implementation of Object.getPrototypeOf
 * see: http://ejohn.org/blog/objectgetprototypeof/
 */
if ( typeof Object.getPrototypeOf !== "function" ) {
  if ( typeof "test".__proto__ === "object" ) {
    Object.getPrototypeOf = function(object){
      return object.__proto__;
    };
  } else {
    Object.getPrototypeOf = function(object){
      // May break if the constructor has been tampered with
      return object.constructor.prototype;
    };
  }
}