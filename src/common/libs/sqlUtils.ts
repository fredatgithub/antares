/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-useless-escape */
import * as moment from 'moment';
import { lineString, point, polygon } from '@turf/helpers';
import customizations from '../customizations';
import { ClientCode } from '../interfaces/antares';
import { BLOB, BIT, DATE, DATETIME, FLOAT, SPATIAL, IS_MULTI_SPATIAL, NUMBER, TEXT_SEARCH } from 'common/fieldTypes';
import hexToBinary, { HexChar } from './hexToBinary';
import { getArrayDepth } from './getArrayDepth';

/**
 * Escapes a string fo SQL use
 *
 * @param { String } string
 * @returns { String } Escaped string
 */
export const sqlEscaper = (string: string): string => {
   // eslint-disable-next-line no-control-regex
   const pattern = /[\0\x08\x09\x1a\n\r"'\\\%]/gm;
   const regex = new RegExp(pattern);
   return string.replace(regex, char => {
      const m = ['\\0', '\\x08', '\\x09', '\\x1a', '\\n', '\\r', '\'', '\"', '\\', '\\\\', '%'];
      const r = ['\\\\0', '\\\\b', '\\\\t', '\\\\z', '\\\\n', '\\\\r', '\\\'', '\\\"', '\\\\', '\\\\\\\\', '\%'];
      return r[m.indexOf(char)] || char;
   });
};

export const objectToGeoJSON = (val: any) => {
   if (Array.isArray(val)) {
      if (getArrayDepth(val) === 1)
         return lineString(val.reduce((acc, curr) => [...acc, [curr.x, curr.y]], []));
      else
         return polygon(val.map(arr => arr.reduce((acc: any, curr: any) => [...acc, [curr.x, curr.y]], [])));
   }
   else
      return point([val.x, val.y]);
};

export const escapeAndQuote = (val: string, client: ClientCode) => {
   const { stringsWrapper: sw } = customizations[client];
   // eslint-disable-next-line no-control-regex
   const CHARS_TO_ESCAPE = /[\0\b\t\n\r\x1a"'\\]/g;
   const CHARS_ESCAPE_MAP: {[key: string]: string} = {
      '\0': '\\0',
      '\b': '\\b',
      '\t': '\\t',
      '\n': '\\n',
      '\r': '\\r',
      '\x1a': '\\Z',
      '"': '\\"',
      '\'': '\\\'',
      '\\': '\\\\'
   };
   let chunkIndex = CHARS_TO_ESCAPE.lastIndex = 0;
   let escapedVal = '';
   let match;

   while ((match = CHARS_TO_ESCAPE.exec(val))) {
      escapedVal += val.slice(chunkIndex, match.index) + CHARS_ESCAPE_MAP[match[0]];
      chunkIndex = CHARS_TO_ESCAPE.lastIndex;
   }

   if (chunkIndex === 0)
      return `${sw}${val}${sw}`;

   if (chunkIndex < val.length)
      return `${sw}${escapedVal + val.slice(chunkIndex)}${sw}`;

   return `${sw}${escapedVal}${sw}`;
};

export const valueToSqlString = (args: {
      val: any;
      client: ClientCode;
      field: {type: string; datePrecision: number};
   }): string => {
   let parsedValue;
   const { val, client, field } = args;
   const { stringsWrapper: sw } = customizations[client];

   if (val === null)
      parsedValue = 'NULL';
   else if (DATE.includes(field.type)) {
      parsedValue = moment(val).isValid()
         ? escapeAndQuote(moment(val).format('YYYY-MM-DD'), client)
         : val;
   }
   else if (DATETIME.includes(field.type)) {
      let datePrecision = '';
      for (let i = 0; i < field.datePrecision; i++)
         datePrecision += i === 0 ? '.S' : 'S';

      parsedValue = moment(val).isValid()
         ? escapeAndQuote(moment(val).format(`YYYY-MM-DD HH:mm:ss${datePrecision}`), client)
         : escapeAndQuote(val, client);
   }
   else if ('isArray' in field) {
      let localVal;
      if (Array.isArray(val))
         localVal = JSON.stringify(val).replaceAll('[', '{').replaceAll(']', '}');
      else
         localVal = typeof val === 'string' ? val.replaceAll('[', '{').replaceAll(']', '}') : '';
      parsedValue = `'${localVal}'`;
   }
   else if (TEXT_SEARCH.includes(field.type))
      parsedValue = `'${val.replaceAll('\'', '\'\'')}'`;
   else if (BIT.includes(field.type))
      parsedValue = `b'${hexToBinary(Buffer.from(val).toString('hex') as undefined as HexChar[])}'`;
   else if (BLOB.includes(field.type)) {
      if (['mysql', 'maria'].includes(client))
         parsedValue = `X'${val.toString('hex').toUpperCase()}'`;
      else if (client === 'pg')
         parsedValue = `decode('${val.toString('hex').toUpperCase()}', 'hex')`;
   }
   else if (NUMBER.includes(field.type))
      parsedValue = val;
   else if (FLOAT.includes(field.type))
      parsedValue = parseFloat(val);
   else if (SPATIAL.includes(field.type)) {
      let geoJson;
      if (IS_MULTI_SPATIAL.includes(field.type)) {
         const features = [];
         for (const element of val)
            features.push(objectToGeoJSON(element));

         geoJson = {
            type: 'FeatureCollection',
            features
         };
      }
      else
         geoJson = objectToGeoJSON(val);

      parsedValue = `ST_GeomFromGeoJSON('${JSON.stringify(geoJson)}')`;
   }
   else if (val === '') parsedValue = `${sw}${sw}`;
   else {
      parsedValue = typeof val === 'string'
         ? escapeAndQuote(val, client)
         : typeof val === 'object'
            ? escapeAndQuote(JSON.stringify(val), client)
            : val;
   }

   return parsedValue;
};

export const jsonToSqlInsert = (args: {
      json: { [key: string]: any};
      client: ClientCode;
      fields: { [key: string]: {type: string; datePrecision: number}};
      table: string;
   }) => {
   const { client, json, fields, table } = args;
   const { elementsWrapper: ew } = customizations[client];
   const fieldNames = Object.keys(json).map(key => `${ew}${key}${ew}`);
   const values = Object.keys(json).map(key => (
      valueToSqlString({ val: json[key], client, field: fields[key] })
   ));

   return `INSERT INTO ${ew}${table}${ew} (${fieldNames.join(', ')}) VALUES (${values.join(', ')});`;
};
