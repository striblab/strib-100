#!/usr/bin/env node

/**
 *
 */

// Just in case
process.on('unhandledRejection', r => console.error(r));

// Dependencies
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const Sheets = require('../../lib/content-sheets.js');
const argv = require('yargs').argv;
const csv = require('d3-dsv').dsvFormat(',');
const _ = require('lodash');

dotenv.load();
// Some hackery because dotenv won't override variables
if (fs.existsSync(path.join(__dirname, '..', '..', '.env'))) {
  const envConfig = dotenv.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', '.env'))
  );
  for (var k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// Settings
const listYear = '2017';
const listDate =
  '' +
  new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');

// Read in list
let list;
if (argv.list && fs.existsSync(argv.list)) {
  list = csv.parse(fs.readFileSync(argv.list, 'utf-8'));
}
else {
  throw new Error('--list not provided or does not exist.');
}

// Responses ID
if (!argv.responses) {
  throw new Error('--responses not provided.');
}

// Main function
async function main() {
  // Get responses
  let s = new Sheets({
    permissions: ['https://www.googleapis.com/auth/spreadsheets']
  });
  let responses = await s.getRawGrid(argv.responses, false, 'formattedValue');

  // check we have data
  if (!responses) {
    throw new Error('No data found in sheet: ' + argv.responses);
  }

  // Just pull out the org ID
  let orgIDResponses = _.filter(
    _.map(responses, r => {
      return r[2];
    })
  );

  // Filter out responses from list
  let followUpList = _.filter(list, l => {
    return orgIDResponses.indexOf(l.orgID) === -1;
  });

  // Output to CSV
  fs.writeFileSync(
    path.join(
      __dirname,
      '..',
      'build',
      'non-profit-survey-list-' + listYear + '-follow-up-' + listDate + '.csv'
    ),
    csv.format(followUpList)
  );

  console.error('Done.');
}

// Do main
main();
