import { SageMakerClient, CreatePresignedMlflowTrackingServerUrlCommand } from '@aws-sdk/client-sagemaker';
import { GENAI_ETK_TRACKING_SERVER_NAME } from '@src/constants';
import { openBrowser } from './openBrowser';

/**
 * Creates a presigned MLFlow URL and launches it in the default browser.
 * @return Promise<void>
 */
export async function launchExperimentUI(): Promise<void> {
  try {
    const response = await new SageMakerClient().send(
      new CreatePresignedMlflowTrackingServerUrlCommand({
        TrackingServerName: GENAI_ETK_TRACKING_SERVER_NAME,
        // Session duration set to 1 hour (3600 seconds)
        SessionExpirationDurationInSeconds: 3600,
        // URL expiration set to 5 minutes (300 seconds)
        ExpiresInSeconds: 300,
      }),
    );

    if (response.AuthorizedUrl) {
      await openBrowser(response.AuthorizedUrl);
      console.log(
        'MLflow UI launched in your default browser - if a browser did not launch, you can manually copy/paste this URL: ',
        response.AuthorizedUrl,
      );
    } else {
      throw new Error('Failed to generate authorized URL');
    }
  } catch (error) {
    console.error('Error launching MLflow UI:', error);
    throw error;
  }
}
