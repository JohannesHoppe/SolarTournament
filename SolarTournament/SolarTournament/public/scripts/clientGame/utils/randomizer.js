// own implementation of a deterministic randomizer
var Randomizer = function() {
    // all constants:
    this.m = 2147483399; // a non-Mersenne prime
    this.a = 40692; // another spectral success story
    this.q = Math.floor(this.m / this.a);
    this.r = Math.floor(this.m % this.a); // again less than q
    this.detRandSeed = 0x0f0f0f0f;
};

Randomizer.prototype.seed = function (s) {
    this.detRandSeed = s;
};

Randomizer.prototype.getRandf = function () {
    return (this.getRand() % 100000) / 100000;
};

Randomizer.prototype.getRand = function () {
    // calculate new seed
    this.detRandSeed = this.a * (this.detRandSeed % this.q) - this.r * (Math.floor(this.detRandSeed / this.q));
    if (this.detRandSeed < 0) this.detRandSeed += this.m;

    return Math.floor(this.detRandSeed);
};