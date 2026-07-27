import { NagSuppressions } from 'cdk-nag';
import { IConstruct } from 'constructs';

/**
 * Convenience function to suppress cdk-nag rules. Supports both single rule suppression and multiple rules.
 * In general, you should aim to suppress at the most granular level possible. However, there may be cases
 * to suppress at a higher level per the docs.
 *
 * @see https://github.com/cdklabs/cdk-nag?tab=readme-ov-file#suppressing-a-rule.
 */
export function suppressCdkNag(construct: IConstruct, id: string, reason: string): void;
export function suppressCdkNag(construct: IConstruct, suppressions: Array<{ id: string; reason: string }>): void;
export function suppressCdkNag(
  construct: IConstruct,
  idOrSuppressions: string | Array<{ id: string; reason: string }>,
  reason?: string,
): void {
  if (typeof idOrSuppressions === 'string') {
    // Single suppression case
    NagSuppressions.addResourceSuppressions(construct, [{ id: idOrSuppressions, reason: reason! }], true);
  } else {
    // Multiple suppressions case
    NagSuppressions.addResourceSuppressions(construct, idOrSuppressions, true);
  }
}
