/**
 * Locale-aware reading and writing of numbers typed into a text field.
 * Indonesian writes "1.500.000,5" where English writes "1,500,000.5". The
 * locale's own decimal separator always means a decimal point and the
 * other of "," and "." means grouping, with one exception: a lone "other"
 * separator followed by no more than `precision` digits is read as a
 * decimal point, since a phone keypad offers whichever separator its own
 * region uses ("85.5" typed on an English keypad in an Indonesian form).
 */

const decimalSeparators = new Map<string, string>();

export function decimalSeparator(locale: string): string {
  let separator = decimalSeparators.get(locale);
  if (separator === undefined) {
    separator =
      new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === "decimal")
        ?.value ?? ".";
    decimalSeparators.set(locale, separator);
  }
  return separator;
}

/** The other of "," and ".": the thousands separator in id-ID and en-US. */
function groupSeparatorFor(decimal: string): string {
  return decimal === "." ? "," : ".";
}

/** Decimal places a number is written with: 0.1 has 1, 0.25 has 2, 1e-7 has 7, 1000 has 0. */
export function fractionDigitsOf(value: number): number {
  const [mantissa = "", exponent] = String(value).split("e");
  const point = mantissa.indexOf(".");
  const mantissaDigits = point === -1 ? 0 : mantissa.length - point - 1;
  return Math.max(0, mantissaDigits - Number(exponent ?? 0));
}

/**
 * Rounds half away from zero, without the float error (1.005 to 2 places
 * is 1.01, not 1.00) and the same on both sides of zero (-1.005 is -1.01,
 * -2.5 is -3).
 */
export function roundTo(value: number, digits: number): number {
  if (value < 0) {
    const rounded = -roundTo(-value, digits);
    // No "-0": it would format as "-0".
    return rounded === 0 ? 0 : rounded;
  }
  if (digits <= 0) return Math.round(value);
  const text = String(value);
  if (text.includes("e")) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
  return Number(`${String(Math.round(Number(`${text}e${digits}`)))}e-${digits}`);
}

export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

export interface NumberTextOptions {
  locale: string;
  /** Fraction digits kept; 0 means whole numbers only. */
  precision: number;
  allowNegative: boolean;
}

/**
 * Filters a keystroke's result down to what a number can hold: digits,
 * grouping separators before the decimal point, one decimal separator with
 * at most `precision` digits after it, and a leading minus when negatives
 * are allowed. Separators are kept as typed; `parseNumberText` decides what
 * they mean, so "1.500" can still grow into "1.500.000".
 *
 * A whole-number field keeps a typed decimal separator but none of the
 * digits after it ("85,5" becomes "85,"): dropping the separator as well
 * would let the next digit join the integer and turn 85,5 into 855.
 */
export function sanitizeNumberText(text: string, options: NumberTextOptions): string {
  const decimal = decimalSeparator(options.locale);
  const group = groupSeparatorFor(decimal);
  // U+2212 too: some locales format negatives with a true minus sign.
  const negative = options.allowNegative && /^\s*[-−]/.test(text);
  let integer = "";
  let fraction: string | null = null;
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      if (fraction === null) integer += char;
      else if (fraction.length < options.precision) fraction += char;
    } else if (char === decimal) {
      fraction ??= "";
    } else if (char === group && fraction === null) {
      integer += char;
    }
  }
  const body = fraction === null ? integer : `${integer}${decimal}${fraction}`;
  return negative ? `-${body}` : body;
}

export interface ParseNumberOptions {
  locale: string;
  /** Fraction digits the field keeps; decides whether a lone "other" separator is a decimal point. */
  precision: number;
}

/**
 * The number a sanitized text holds, or null while it holds none ("", "-",
 * ","). Never NaN. See the module comment for how separators are read.
 */
export function parseNumberText(text: string, options: ParseNumberOptions): number | null {
  const decimal = decimalSeparator(options.locale);
  const group = groupSeparatorFor(decimal);
  const negative = /^\s*[-−]/.test(text);
  let integer = text;
  let fraction = "";
  const decimalAt = text.indexOf(decimal);
  const groupAt = text.indexOf(group);
  if (decimalAt !== -1) {
    integer = text.slice(0, decimalAt);
    fraction = text.slice(decimalAt + 1);
  } else if (
    groupAt !== -1 &&
    groupAt === text.lastIndexOf(group) &&
    text.length - groupAt - 1 <= options.precision
  ) {
    integer = text.slice(0, groupAt);
    fraction = text.slice(groupAt + 1);
  }
  const integerDigits = integer.replace(/\D/g, "");
  const fractionDigits = fraction.replace(/\D/g, "");
  if (integerDigits === "" && fractionDigits === "") return null;
  const value = Number(`${integerDigits || "0"}.${fractionDigits || "0"}`);
  if (!Number.isFinite(value)) return null;
  return negative && value !== 0 ? -value : value;
}

export interface FormatNumberOptions {
  precision: number;
  useGrouping: boolean;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/** At most `precision` fraction digits, none padded on ("85,5", not "85,50"). */
export function formatNumber(value: number, locale: string, options: FormatNumberOptions): string {
  const key = `${locale}|${options.precision}|${options.useGrouping}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      maximumFractionDigits: Math.min(Math.max(options.precision, 0), 20),
      useGrouping: options.useGrouping,
    });
    numberFormats.set(key, format);
  }
  return format.format(value);
}
