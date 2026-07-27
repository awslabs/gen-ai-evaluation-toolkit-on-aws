import { IVpc } from 'aws-cdk-lib/aws-ec2';
import { IEventBus } from 'aws-cdk-lib/aws-events';
import { IKey } from 'aws-cdk-lib/aws-kms';

export type GenAiEtkPluginProps = {
  /**
   * The eventbus that is used to enable async communication between the workflow and the plugin
   */
  eventBus: IEventBus;

  /**
   * The VPC the plugin should be deployed to
   */
  vpc: IVpc;

  /**
   * Optional customer-managed KMS key for encryption
   */
  encryptionKey?: IKey;
};
