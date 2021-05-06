import { SiteMetadata } from '@/shared/interfaces/sites';
import urlparse from 'url-parse';
import { findThenParseNumberString, findThenParseSizeString, parseSizeString } from '@/shared/utils/filter';
import Sizzle from 'sizzle';

export const siteMetadata: SiteMetadata = {
  name: 'SDBits',
  aka: ['SDB'],
  timezoneOffset: '+0000',
  description: 'SDB, HDB姊妹站',
  url: 'https://sdbits.org/',
  tags: ['影视', '综合'],
  collaborator: 'luckiestone',
  search: {
    keywordsParam: 'search',
    requestConfig: {
      url: '/browse.php'
    },
    categories: [
      {
        name: 'Category',
        key: 'cat',
        options: [
          { value: 1, name: 'Movie' },
          { value: 2, name: 'TV' },
          { value: 3, name: 'Documentary' },
          { value: 4, name: 'Music' },
          { value: 5, name: 'Sports' },
          { value: 6, name: 'Audio' },
          { value: 7, name: 'Stand-up Comedy' }
        ]
      }
    ]
  },
  userInfo: {
    process: [
      {
        requestConfig: { url: '/index.php' },
        fields: ['id', 'name', 'messageCount']
      },
      {
        requestConfig: { url: '/userdetails.php' },
        assertion: { id: 'id' },
        fields: ['uploaded', 'downloaded', 'ratio', 'levelName', 'bonus', 'joinTime']
      },
      {
        requestConfig: { url: '/userdetails.php', params: { seeding: 1 } },
        assertion: { id: 'id' },
        fields: ['seeding', 'seedingSize']
      }
    ]
  },
  selector: {
    search: {
      tags: [
        { name: 'Free', selector: "a[style^='color:#000099']" }
      ]
    },
    userInfo: {
      id: {
        selector: "a[href*='userdetails.php']:first",
        attr: 'href',
        filters: [(q:string) => urlparse(q, true).query.id]
      },
      name: {
        selector: "a[href*='userdetails.php']:first"
      },
      messageCount: {
        selector: "table[bgcolor*='red'] a[href*='inbox.php']",
        filters: [findThenParseNumberString]
      },
      uploaded: {
        selector: "td.rowhead:contains('Uploaded') + td",
        filters: [findThenParseSizeString]
      },
      downloaded: {
        selector: "td.rowhead:contains('Downloaded') + td",
        filters: [findThenParseSizeString]
      },
      ratio: {
        selector: "font:contains('Ratio') +",
        filters: [parseFloat]
      },
      levelName: {
        selector: ["td.rowhead:contains('Class') + td"]
      },
      bonus: {
        selector: ["td.heading:contains('Bonus') + td"],
        filters: [findThenParseNumberString]
      },
      joinTime: {
        selector: ["td.rowhead:contains('JOIN'):contains('date') + td"],
        filters: ["query.text().split(' (')[0]", 'dateTime(query).isValid()?dateTime(query).valueOf():query']
      },
      seeding: {
        selector: "td.heading:contains('Currently'):contains('seeding') + td",
        elementProcess: [
          (element: HTMLElement) => {
            const trAnothers = Sizzle('tr:not(:eq(0))', element);
            return trAnothers.length;
          }
        ]
      },
      seedingSize: {
        selector: "td.heading:contains('Currently'):contains('seeding') + td",
        elementProcess: [
          (element: HTMLElement) => {
            let seedingSize = 0;
            const trAnothers = Sizzle('tr:not(:eq(0))', element);
            trAnothers.forEach(trAnother => {
              const sizeAnother = Sizzle('td:eq(3)', trAnother)[0];
              seedingSize += parseSizeString((sizeAnother as HTMLElement).innerText.trim());
            });
            return seedingSize;
          }
        ]
      }
    }
  }
};
