/**
 * Export out contact list for non-profit survey.
 */

// Dependencies
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const csv = require('d3-dsv').dsvFormat(',');
const queryString = require('query-string');
const parseName = require('parse-full-name').parseFullName;
const mysql = require('mysql');
const queue = require('d3-queue').queue;
const GoogleURL = require('google-url');
require('dotenv').load();

// Settings
const listYear = '2017';
const listDate =
  '' +
  new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

// Make sure we have credentials
if (
  !process.env.MYSQL_HOST ||
  !process.env.MYSQL_USER ||
  !process.env.MYSQL_DATABASE
) {
  throw new Error(
    'Make sure the following environment variables are set: MYSQL_USER, MYSQL_HOST, MYSQL_DATABASE || MYSQL_PASS is optional.'
  );
}

// URL shortner
const shortener = new GoogleURL({ key: process.env.GOOGLE_API_KEY });

// Cache
const cachePath = path.join(
  __dirname,
  '..',
  '.cache',
  'non-profit-survey-list.cache.json'
);
let cache = {};
if (fs.existsSync(cachePath)) {
  cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
}
const writeCache = () => {
  fs.writeFileSync(cachePath, JSON.stringify(cache));
};

// Connect
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS || '',
  database: process.env.MYSQL_DATABASE
});
db.connect();

// Main query
let query = `
  SELECT
    *
  FROM
    Companies AS c
  WHERE
    (
      c.CompanyType LIKE 'nonprofit%'
      OR c.CompanyType LIKE 'charity%'
      OR c.CompanyType LIKE 'trust%'
    )
    AND c.CompanyType NOT LIKE '%drop%'
`;

// Do the stuff
db.query(query, (error, results) => {
  if (error) {
    throw new Error(error);
  }
  let q = queue(1);

  // Parse results
  function parse(r, done) {
    // Parse name
    let name = parseName(r.Contact);
    if (name.error && name.error.length) {
      console.error('Name parse error: ' + name.error);
    }
    delete name.error;

    // Put together
    let p = _.extend(name, {
      contact: r.Contact,
      phone: r.ContactPhone,
      email: r.ContactEmail,
      orgID: r.COID,
      orgIRSNo: r.IRSNo,
      orgName: r.Company,
      orgType: r.CompanyType,
      orgAddressFull: _.filter([
        r.Address1 + (r.Address2 ? ' ' + r.Address2 : ''),
        r.City,
        r.State + ' ' + r.Zip
      ]).join(', '),
      orgWebsite: r.WWWW,
      orgDescription: r.Description,
      orgShortDescription: r.ShortDesc
    });

    // Check for email and name
    if (p.email && !p.contact) {
      console.error('Has email, but no contact name: ', p);
    }

    // Make google form survey link
    p.surveyURL =
      'https://docs.google.com/forms/d/e/1FAIpQLScO4XCP1lF_EBCo0K1FXMy111Yrk7nQZZq5ATl1BvELb4qLWQ/viewform?usp=pp_url&' +
      queryString.stringify({
        'entry.463322031': process.env.SURVEY_PASS,
        'entry.311536750': p.orgID,
        'entry.646452484': p.orgName,
        'entry.1440568490': p.orgIRSNo,
        'entry.1326466709': p.orgAddressFull,
        'entry.1296712022': p.orgWebsite,
        'entry.947743576': p.orgShortDescription,
        'entry.616715940': p.orgDescription,
        'entry.588271044': p.contact,
        'entry.1899543844': p.email,
        'entry.1414459639': p.phone
      });

    // Mailchimp only allows for 255 chracters (255 bytes)
    // https://kb.mailchimp.com/lists/growth/format-guidelines-for-your-import-file
    if (cache.urls && cache.urls[p.surveyURL]) {
      p.surveyURLShort = cache.urls[p.surveyURL];
      return done(null, p);
    }

    shortener.shorten(p.surveyURL, (error, short) => {
      if (error) {
        return done(error);
      }

      p.surveyURLShort = short;
      cache.urls = cache.urls || {};
      cache.urls[p.surveyURL] = short;
      writeCache();
      done(null, p);
    });
  }

  // Queue
  _.each(results, r => {
    q.defer(parse, r);
  });

  // All done
  q.awaitAll((error, parsed) => {
    if (error) {
      throw new Error(error);
    }

    // Output to CSV
    fs.writeFileSync(
      path.join(
        __dirname,
        '..',
        'build',
        'non-profit-survey-list-' + listYear + '-' + listDate + '.csv'
      ),
      csv.format(parsed)
    );

    console.error('Done.');
    db.end();
  });
});
