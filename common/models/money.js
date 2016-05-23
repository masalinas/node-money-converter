var loopback = require('loopback');
var requestIp = require('request-ip');
var geoip = require('geoip-lite');
var countryLookup = require('country-data').lookup;
var request = require("request");
var fx = require('money');

/* Technologic:
 https://www.npmjs.com/package/geoip-lite: geolocate from IP
 https://www.npmjs.com/package/country-data: country helper data
 https://openexchangerates.org/: Open Change SaaS.
 http://openexchangerates.github.io/money.js/: Converter from datasource.
 http://fixer.io/: published datasource by the European Central Bank.
 */

module.exports = function(Change) {
  Change.converter = function(ammount, currency, cb) {
    var ctx = loopback.getCurrentContext();

    if (ctx.active.http.req == undefined )
      cb(new Error("Not exist request!"));

    // get client IP
    var clientIp = requestIp.getClientIp(ctx.active.http.req);

    if (clientIp == undefined || clientIp == null)
      cb(new Error("Not exist IP"));

    // get geolocation from client IP
    var geo = geoip.lookup(clientIp);

    if (geo == undefined || geo == null)
      cb(new Error("Not exist geo"));

    // get origin currency from country ISO alpha2 code
    var country = countryLookup.countries({alpha2: geo.country})[0];

    if (country == undefined)
      return cb(new Error('No exist any country with this code'));

    var geoCurrency = country.currencies[0];

    // get destination currency from currency selected
    var currencyDestination = countryLookup.currencies({code: currency})[0];

    if (currencyDestination == undefined)
      return cb(new Error('No exist any current with this code' + currency));

    // make exchange money request.
    // Rates published by the European Central Bank.
    // The rates are updated daily around 3PM CET.
    request({
      method: 'GET',
      url: 'http://api.fixer.io/latest?base='+geoCurrency,
    }, function (error, response, body) {
      if(error)
        return cb(error);

      if(response.statusCode != "200")
        return cb(response);

      // configure fixer
      fx.rates = JSON.parse(response.body).rates;

      // Simple syntax:
      var rate;
      try {
        rate = fx(ammount).to(currency);
      }
      catch (err) {
        return cb(err);
      }

      cb(null, rate + ' ' + currencyDestination.name);
    });
  };

  Change.remoteMethod (
    'converter',
    {
      description : "Convert an ammount of money from country currency detected to another currency",
      accepts: [{arg: 'ammount', description: 'Ammount money', type: 'number', required: true, http: {source: 'path'}},
                {arg: 'currency', description: 'Destination currency', type: 'string', required: true, http: {source: 'path'}}],
      returns: {arg: 'change', type: 'object', root: true},
      http: {verb: 'get', path: '/changes/:ammount/:currency'}
    }
  );
};
