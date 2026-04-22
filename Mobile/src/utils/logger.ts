export const isDev = __DEV__;

export const log = (...args: any[]) => {
  if (isDev) console.log(...args);
};

export const warn = (...args: any[]) => {
  if (isDev) console.warn(...args);
};

export const error = (...args: any[]) => {
  console.error(...args); // erro sempre aparece
};
