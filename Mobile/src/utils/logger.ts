export const isDev = __DEV__;

export const debug = (...args: any[]) => {
  if (isDev) console.log(...args);
};

export const log = debug;

export const info = (...args: any[]) => {
  if (isDev) console.info(...args);
};

export const warn = (...args: any[]) => {
  console.warn(...args);
};

export const error = (...args: any[]) => {
  console.error(...args);
};
