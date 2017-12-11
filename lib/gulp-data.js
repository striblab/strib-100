/**
 * Get data for application.
 */

// Dependencies
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const mysql = require('mysql');
const csv = require('d3-dsv').dsvFormat(',');

// Some top-level vars
const logoPath = path.join(__dirname, '..', 'assets', 'logos');
const ceoPath = path.join(__dirname, '..', 'assets', 'ceos');

// Main fetch function
function fetchData(options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
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

      // Get raw data
      let data = await getRawData(db, options);

      // Combine
      let companies = _.map(data.companies, c => {
        c.employees = _.keyBy(
          _.filter(data.employees, { coid: c.coid }),
          'publishYear'
        );
        c.finances = _.keyBy(
          _.filter(data.finances, { coid: c.coid }),
          'publishYear'
        );
        c.officers = _.keyBy(
          _.filter(data.officers, { coid: c.coid }),
          'publishYear'
        );
        return c;
      });

      // Look for images
      companies = _.map(companies, c => {
        // Company logo
        c.hasLogo = false;
        if (fs.existsSync(path.join(logoPath, c.coid + '.png'))) {
          c.hasLogo = true;
        }

        // Officer path
        _.each(c.officers, (o, oi) => {
          c.officers[oi].hasImage = false;
          if (fs.existsSync(path.join(ceoPath, o.officerId + '.png'))) {
            c.officers[oi].hasImage = true;
          }
        });

        return c;
      });

      // Other cleaning
      companies = _.map(companies, c => {
        c.category = cleanCategory(c.category);
        return c;
      });

      // Rank
      let revenues = _.sortBy(
        _.filter(
          _.uniq(
            _.map(companies, c => {
              return c.finances && c.finances[options.publishYear]
                ? c.finances[options.publishYear].revenue
                : 0;
            })
          )
        )
      ).reverse();
      companies = _.map(companies, c => {
        let revenue =
          c.finances && c.finances[options.publishYear]
            ? c.finances[options.publishYear].revenue
            : 0;
        let f = revenues.indexOf(revenue);
        c.rank = f >= 0 ? f + 1 : undefined;
        return c;
      });

      // Previous year rank
      let previousYearsRevenues = _.sortBy(
        _.filter(
          _.uniq(
            _.map(companies, c => {
              return c.finances && c.finances[options.publishYear - 1]
                ? c.finances[options.publishYear - 1].revenue
                : 0;
            })
          )
        )
      ).reverse();
      companies = _.map(companies, c => {
        let pRevenue =
          c.finances && c.finances[options.publishYear - 1]
            ? c.finances[options.publishYear - 1].revenue
            : 0;
        let f = previousYearsRevenues.indexOf(pRevenue);
        c.previousRank = f >= 0 ? f + 1 : undefined;
        return c;
      });

      // Sort by rank
      companies = _.sortBy(companies, c => {
        return c.rank ? c.rank : 99999;
      });

      // Write out
      if (options.output) {
        fs.writeFileSync(
          options.output,
          JSON.stringify(_.take(companies, 100))
        );

        // Write simplefied CSV for image stuff
        fs.writeFileSync(
          options.output.replace('.json', '-simple.csv'),
          csv.format(
            _.map(_.take(companies, 100), c => {
              return {
                coid: c.coid,
                company: c.company,
                officerName: c.officers[options.publishYear]
                  ? c.officers[options.publishYear].first +
                    ' ' +
                    c.officers[options.publishYear].last
                  : '',
                officerID: c.officers[options.publishYear]
                  ? c.officers[options.publishYear].officerId
                  : ''
              };
            })
          )
        );

        // Write csvs for print
        let printCategories = [
          'social-services',
          'healthcare',
          'education',
          ['arts', 'other']
        ];
        _.each(printCategories, c => {
          let cname = _.isString(c) ? c : c.join('-');
          let filtered = _.filter(companies, o => {
            return (
              o.rank &&
              o.rank <= 100 &&
              (_.isString(c) ? o.category === c : ~c.indexOf(o.category))
            );
          });

          fs.writeFileSync(
            options.output.replace('.json', '-print-' + cname + '.csv'),
            csv.format(
              _.map(filtered, c => {
                return {
                  rank: c.rank,
                  company: c.company,
                  revenue: c.finances[options.publishYear].revenue,
                  previousRevenue: c.finances[options.publishYear - 1]
                    ? c.finances[options.publishYear - 1].revenue
                    : null,
                  revenueChangePercent:
                    c.finances[options.publishYear].revenue &&
                    c.finances[options.publishYear - 1] &&
                    c.finances[options.publishYear - 1].revenue
                      ? (c.finances[options.publishYear].revenue -
                          c.finances[options.publishYear - 1].revenue) /
                        c.finances[options.publishYear - 1].revenue *
                        100
                      : null,
                  expenses: c.finances[options.publishYear].expenses,
                  grantsAsPercentOfRevenue:
                    c.finances[options.publishYear].contribGrants &&
                    c.finances[options.publishYear].revenue
                      ? c.finances[options.publishYear].contribGrants /
                        c.finances[options.publishYear].revenue *
                        100
                      : null,
                  excess: c.finances[options.publishYear].excess,
                  fiscalYearEnd: c.finances[options.publishYear].fiscalYearEnd
                    .toISOString()
                    .slice(0, 10),
                  topOfficer:
                    c.officers && c.officers[options.publishYear]
                      ? c.officers[options.publishYear].first +
                        ' ' +
                        c.officers[options.publishYear].last +
                        (c.officers[options.publishYear].suffix
                          ? ', ' + c.officers[options.publishYear].suffix
                          : '')
                      : null,
                  compensation:
                    c.officers && c.officers[options.publishYear]
                      ? c.officers[options.publishYear].total
                      : undefined
                };
              })
            )
          );
        });
      }

      db.end();
      resolve(data);
    }
    catch (e) {
      reject(e);
    }
  });
}

// Run queries and get raw data
async function getRawData(db, options = {}) {
  let fields = getFields();
  let data = {};
  let years = _.range(2000, options.publishYear + 1);

  // We need to get the list of companies first
  data.companies = cleanFields(
    await query(db, getQuery('companies', { fields: fields }))
  );
  let companyList = arrayToSQL(_.map(data.companies, 'coid'));

  // Get other data
  data.employees = cleanFields(
    await query(
      db,
      getQuery('employees', {
        fields: fields,
        companyList: companyList,
        years: arrayToSQL(_.takeRight(years, 2))
      })
    )
  );
  data.finances = cleanFields(
    await query(
      db,
      getQuery('finances', {
        fields: fields,
        companyList: companyList,
        years: arrayToSQL(_.takeRight(years, 2))
      })
    )
  );
  data.officers = cleanFields(
    await query(
      db,
      getQuery('officers', {
        fields: fields,
        companyList: companyList,
        years: arrayToSQL(_.takeRight(years, 2))
      })
    )
  );

  return data;
}

// Queries needed
function getQuery(query, data) {
  let queries = {};
  queries.companies = `
    SELECT
      ${data.fields.c.join(', ')}
    FROM
      Companies AS c
    WHERE
      (
        c.CompanyType LIKE 'nonprofit%'
        OR c.CompanyType LIKE 'charity%'
        OR c.CompanyType LIKE 'trust%'
      )
      AND c.CompanyType NOT LIKE '%drop%'
      AND c.State = 'MN'
    ORDER BY
      c.COID DESC
  `;

  queries.employees = `
    SELECT
      ${data.fields.e.join(', ')}
    FROM
      Employees AS e
    WHERE
      e.COID IN (${data.companyList})
      AND e.PublishYear IN (${data.years})
    ORDER BY
      e.PublishYear DESC,
      e.COID DESC
  `;

  queries.finances = `
    SELECT
      ${data.fields.f.join(', ')}
    FROM
      NonProfit_Finances AS f
    WHERE
      f.COID IN (${data.companyList})
      AND f.PublishYear IN (${data.years})
    ORDER BY
      f.PublishYear DESC,
      f.COID DESC
  `;

  queries.officers = `
    SELECT
      ${data.fields.o.join(', ')},
      ${data.fields.s.join(', ')},
      s.ID AS SalaryID,
      o.Footnotes AS OfficerFootnotes,
      s.Footnotes AS SalaryFootnotes
    FROM
      Officers AS o
        INNER JOIN NonProfit_Salaries AS s
          ON o.ID = s.OfficerID
    WHERE
      (
        o.Title LIKE '%president%'
        OR o.Title LIKE '%ceo%'
        OR o.Title LIKE '%chief%executive%'
        OR o.Title LIKE '%director%'
      )
      AND o.COID IN (${data.companyList})
      AND s.PublishYear IN (${data.years})
    ORDER BY
      s.PublishYear DESC,
      o.COID DESC
  `;

  return queries[query];
}

// Fields that are needed
function getFields() {
  return {
    c: [
      'COID',
      'Added',
      'Company',
      'CompanyType',
      'Category',
      'Address1',
      'Address2',
      'City',
      'State',
      'Zip',
      'WWW',
      'ShortDesc',
      'History',
      'Founded',
      'Footnotes'
    ],
    e: ['ID', 'COID', 'Total', 'Added', 'PublishYear'],
    o: [
      //'ID',
      'COID',
      'Dropped',
      'First',
      'Middle',
      'Last',
      'Lineage',
      'Title'
      //'Footnotes'
    ],
    s: [
      //'ID',
      'OfficerID',
      'Added',
      'PublishYear',
      'FiscalYearEnd',
      'Salary',
      'Benefit',
      'Other',
      'Bonus',
      'Deferred',
      'Total'
      //'Footnotes'
    ],
    f: [
      'ID',
      'COID',
      'Added',
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
}

// Clean categories
function cleanCategory(category) {
  if (!category) {
    return 'other';
  }
  else if (category.match(/health\s*care/i)) {
    return 'healthcare';
  }
  else if (category.match(/social\s*serv/i)) {
    return 'social-services';
  }
  else if (category.match(/^art/i)) {
    return 'arts';
  }
  else if (category.match(/education/i)) {
    return 'education';
  }
  else {
    return 'other';
  }
}

// Clean field names
function cleanFields(input) {
  if (_.isArray(input)) {
    return _.map(input, i => {
      return _.isObject(i)
        ? _.mapKeys(i, (v, k) => {
          return _.camelCase(k.replace(/^(o_|s_|f_)/i, ''));
        })
        : i;
    });
  }
  else if (_.isObject(input)) {
    return _.mapKeys(input, (v, k) => {
      return _.camelCase(k.replace(/^(o_|s_|f_)/i, ''));
    });
  }
  else {
    return input;
  }
}

// Make array into sql list
function arrayToSQL(arr) {
  return _.isArray(arr) ? '\'' + arr.join('\', \'') + '\'' : '\'\'';
}

// Promisify query
function query(db, query) {
  return new Promise((resolve, reject) => {
    db.query(query, (error, results) => {
      if (error) {
        return reject(error);
      }

      resolve(results ? _.map(results) : results);
    });
  });
}

// Gulp task format
module.exports = (name, options) => {
  return () => {
    fetchData(options);
  };
};
