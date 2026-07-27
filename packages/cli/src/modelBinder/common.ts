export type ModelBinder<T = unknown> = {
  isBoolean?: boolean;
  alternativParamName?: (original: string) => string;
  parseArg: (value: string, previous: unknown) => T;
  descriptionGenerator?: (defaultDescription: string, flag: string) => string;
};
