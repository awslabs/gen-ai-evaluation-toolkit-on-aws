import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ECRDeployment } from 'cdk-ecr-deployment';

export type ContainerImageReference = {
  imageTag: string;
  ecrRepo: Repository;
  ecrDeployment: ECRDeployment;
};
