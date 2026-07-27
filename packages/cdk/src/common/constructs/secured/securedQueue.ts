import { Queue, QueueEncryption, QueueProps } from 'aws-cdk-lib/aws-sqs';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export type SecuredQueueProps = QueueProps & {
  encryptionKey?: IKey;
};

export class SecuredQueue extends Queue {
  public readonly encryptionKey?: IKey;
  constructor(scope: Construct, id: string, props: SecuredQueueProps = {}) {
    const encryptionConfig = SecuredQueue.getEncryptionConfig(props.encryptionKey);

    super(scope, id, {
      ...props,
      ...encryptionConfig,
      enforceSSL: true,
    });

    // Store the encryption key for use in grant methods
    this.encryptionKey = props.encryptionKey;
  }

  private static getEncryptionConfig(encryptionKey?: IKey): Partial<QueueProps> {
    if (encryptionKey) {
      return {
        encryption: QueueEncryption.KMS,
        encryptionMasterKey: encryptionKey,
      };
    }
    // Maintain existing default behavior
    return {
      encryption: QueueEncryption.SQS_MANAGED,
    };
  }
}
