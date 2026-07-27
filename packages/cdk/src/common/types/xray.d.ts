/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'aws-xray-sdk-core' {
  export function captureAWS(aws: any): any;
  export function captureAsyncFunc(name: string, fcn: (subsegment?: Subsegment) => Promise<any>): Promise<any>;

  export interface Subsegment {
    addAnnotation(key: string, value: string | number | boolean): void;
    addError(error: Error): void;
    close(): void;
  }
  export function captureAWSv3Client(any: any): any;
}
