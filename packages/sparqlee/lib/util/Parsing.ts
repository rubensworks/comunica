// TODO: Find a library for this

/**
 * TODO: Fix decently
 * Parses float datatypes (double, float).
 *
 * All invalid lexical values return undefined.
 *
 * @param value the string to interpret as a number
 */
export function parseXSDFloat(value: string): number | undefined {
  const numb: number = Number(value);
  if (isNaN(numb)) {
    if (value === 'NaN') { return NaN; }
    if (value === 'INF') { return Infinity; }
    if (value === '-INF') { return -Infinity; }
    return undefined;
  }
  return numb;
}

/**
 * Parses decimal datatypes (decimal, int, byte, nonPositiveInteger, etc...).
 *
 * All other values, including NaN, INF, and floating point numbers all
 * return undefined;
 *
 * @param value the string to interpret as a number
 */
export function parseXSDDecimal(value: string): number | undefined {
  if (/^(\-|\+)?([0-9]+(\.[0-9]+)?)$/.test(value)) {
    const numb: number = Number(value);
    return (isNaN(numb)) ? undefined : numb;
  }
  return undefined;
}

/**
 * Parses integer datatypes (decimal, int, byte, nonPositiveInteger, etc...).
 *
 * All other values, including NaN, INF, and floating point numbers all
 * return undefined;
 *
 * @param value the string to interpret as a number
 */
export function parseXSDInteger(value: string): number | undefined {
  if (/^(\-|\+)?([0-9]+)$/.test(value)) {
    const numb: number = Number(value);
    return (isNaN(numb)) ? undefined : numb;
  }
  return undefined;
}

export interface SplittedDate {
  year: string;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
  timezone: string;
}

/**
 * Parses ISO date time strings into it's parts.
 * I found no lib providing this functionality online, but it's needed heavily
 * by the spec (functions on dates), using any form of JS DateTime will lose the
 * original timezone notation.
 *
 * Example strings:
 *  - "2011-01-10T14:45:13.815-05:00"
 *  - "2011-01-10T14:45:13.815Z"
 *  - "2011-01-10T14:45:13Z"
 * @param value the ISO date time string
 */
export function parseXSDDateTime(value: string): SplittedDate {
  const [date, timeAndTimeZone] = value.split('T');
  const [year, month, day] = date.split('-');
  const [time, _timeZoneChopped] = timeAndTimeZone.split(/[\+\-Z]/);
  const [hours, minutes, seconds] = time.split(':');
  const timezoneOrNull = new RegExp(/([\+\-Z].*)/).exec(timeAndTimeZone);
  const timezone = (timezoneOrNull) ? timezoneOrNull[0] : '';
  return { year, month, day, hours, minutes, seconds, timezone };
}
