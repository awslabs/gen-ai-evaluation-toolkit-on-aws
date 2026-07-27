import { getEndpoint } from '../helpers';

describe('Security Tests', () => {
  describe('Security tests', () => {
    test('Unauthenticated request is rejected', async () => {
      const response = await fetch((await getEndpoint()) + 'datasets');

      expect(response.status).toBe(403);
    });
  });
});
