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