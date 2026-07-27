import { fromSdkAnnotationValueType } from '@datastore/api/types';
import { ValidationException } from '@src/common/api/exceptions/serviceExceptions';
import type { AnnotationValueType as SdkAnnotationValueType } from '@awssolutions/gen-ai-evaluation-toolkit-ts-ssdk';

describe('fromSdkAnnotationValueType', () => {
  it('should convert numericType to number', () => {
    const result = fromSdkAnnotationValueType({ numericType: {} } as SdkAnnotationValueType);
    expect(result).toEqual({ number: {} });
  });

  it('should convert stringType to string', () => {
    const result = fromSdkAnnotationValueType({ stringType: { enum: ['Good', 'Bad'] } } as SdkAnnotationValueType);
    expect(result).toEqual({ string: { enum: ['Good', 'Bad'] } });
  });

  it('should throw ValidationException for invalid SDK type', () => {
    expect(() => fromSdkAnnotationValueType({} as SdkAnnotationValueType)).toThrow(ValidationException);
  });
});
