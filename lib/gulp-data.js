/**
 * Get data for application.
 */

// Dependencies
const fs = require('fs');
const _ = require('lodash');
const mysql = require('mysql');

// Main fetch function
function fetchData(done, options = {}) {
  // We'll need mysql connection for this
  if (
    !process.env.MYSQL_HOST ||
    !process.env.MYSQL_USER ||
    !process.env.MYSQL_DATABASE
  ) {
    throw new Error(
      'Make sure the following environment variables are set: MYSQL_USER, MYSQL_HOST, MYSQL_DATABASE || MYSQL_PASS is optional.'
    );
  }

  // Connection
  const db = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS || '',
    database: process.env.MYSQL_DATABASE
  });
  db.connect();

  // Fields. to ensure we don't overwrite by using a SELECT *
  let fields = {
    c: [
      'COID',
      'Company',
      'CompanyType',
      'Address1',
      'Address2',
      'City',
      'State',
      'Zip',
      'WWW',
      'Description',
      'ShortDesc',
      'History',
      'Founded',
      'Footnotes'
    ],
    e: ['ID', 'Total', 'Date'],
    o: ['ID', 'First', 'Middle', 'Last', 'Lineage', 'Title', 'Footnotes'],
    s: [
      'ID',
      'OfficerID',
      'FiscalYearEnd',
      'Salary',
      'Benefit',
      'Other',
      'Bonus',
      'Deferred',
      'Total',
      'Footnotes'
    ],
    f: [
      'ID',
      'PublishYear',
      'FiscalYearEnd',
      'AnnualReportDate',
      'Source',
      'ContribGrants',
      'Revenue',
      'Expenses',
      'Excess',
      'ProgramServiceRevenue',
      'Footnotes'
    ]
  };
  fields.prevf = fields.f;
  let fieldSelect = _.reduce(
    fields,
    (a, fields, table) => {
      return a.concat(
        _.map(fields, f => {
          return table + '.' + f + ' AS ' + table + '_' + f;
        })
      );
    },
    []
  ).join(', ');

  // Create query
  let query = `
    SELECT
      ${fieldSelect}
    FROM
      Companies AS c
        LEFT JOIN Officers AS o
          ON o.COID = c.COID
          AND o.Dropped <> 1
          LEFT JOIN NonProfit_Salaries AS s
            ON s.OfficerID = o.ID
        LEFT JOIN Employees AS e
          ON e.COID = c.COID
          AND YEAR(e.Date) = ${options.publishYear}
        LEFT JOIN NonProfit_Finances AS f
          ON f.COID = c.COID
          AND f.PublishYear = ${options.publishYear}
        LEFT JOIN NonProfit_Finances AS prevf
          ON f.COID = c.COID
          AND f.PublishYear = ${options.publishYear - 1}
    WHERE
      (
        c.CompanyType LIKE 'nonprofit%'
        OR c.CompanyType LIKE 'charity%'
        OR c.CompanyType LIKE 'trust%'
      )
      AND c.CompanyType NOT LIKE '%drop%'
      AND c.State = 'MN'
  `;
  db.query(query, (error, results) => {
    if (error) {
      return done(error);
    }

    // Put into a nested structure
    let combined = _.map(_.groupBy(results, 'c_COID'), c => {
      let company = {};
      _.each(fields.c, f => {
        company[_.camelCase(f)] = c[0]['c_' + f];
      });

      // Employees is one to one
      company.employees = {};
      _.each(fields.e, f => {
        company.employees[_.camelCase(f)] = c[0]['e_' + f];
      });

      // Financies are one to one
      company.finances = {};
      _.each(fields.f, f => {
        company.finances[_.camelCase(f)] = c[0]['f_' + f];
      });
      company.prevFinances = {};
      _.each(fields.prevf, f => {
        company.prevFinances[_.camelCase(f)] = c[0]['prevf_' + f];
      });

      // Officers are hairy
      let officers = _.sortBy(
        _.map(_.filter(c, 's_ID'), d => {
          return _.pick(
            d,
            _.map(fields.o, o => 'o_' + o).concat(
              _.map(fields.s, s => 's_' + s)
            )
          );
        }),
        's_FiscalYearEnd'
      ).reverse();
      company.officer = _.take(officers, 2);
      return company;
    });

    // Write out top ten
    combined = _.take(
      _.map(
        _.sortBy(combined, c => {
          return c.finances && c.finances.revenue ? c.finances.revenue : 0;
        }).reverse(),
        (c, ci) => {
          c.rank = ci;
          return c;
        }
      ),
      100
    );

    if (options.output) {
      fs.writeFileSync(options.output, JSON.stringify(combined));
    }

    db.end();
    done(null);
  });
}

// Gulp task format
module.exports = (name, options) => {
  return done => {
    fetchData(done, options);
  };
};
