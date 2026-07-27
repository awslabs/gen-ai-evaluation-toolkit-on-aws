import { getExistingVpcConfig } from '../../lib/common';

describe('getExistingVpcConfig', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  beforeEach(() => {
    delete process.env.EXISTING_VPC_ID;
    delete process.env.EXISTING_API_GW_VPC_ENDPOINT_ID;
    delete process.env.EXISTING_ISOLATED_SUBNET_IDS;
  });

  test('returns undefined when EXISTING_VPC_ID is not set', () => {
    expect(getExistingVpcConfig()).toBeUndefined();
  });

  test('throws a clear error when EXISTING_VPC_ID is set without EXISTING_API_GW_VPC_ENDPOINT_ID', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';

    expect(() => getExistingVpcConfig()).toThrow(
      /EXISTING_API_GW_VPC_ENDPOINT_ID must be set when EXISTING_VPC_ID is set/,
    );
  });

  test('returns vpcId and apiGwVpcEndpointId on the existing-VPC path', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-0abc123456789def0';

    expect(getExistingVpcConfig()).toEqual({
      vpcId: 'vpc-12345678',
      apiGwVpcEndpointId: 'vpce-0abc123456789def0',
    });
  });

  test('parses comma-separated EXISTING_ISOLATED_SUBNET_IDS, trimming whitespace', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-0abc123456789def0';
    process.env.EXISTING_ISOLATED_SUBNET_IDS =
      'subnet-0aaa111111111111a, subnet-0bbb222222222222b ,subnet-0ccc333333333333c';

    expect(getExistingVpcConfig()).toEqual({
      vpcId: 'vpc-12345678',
      apiGwVpcEndpointId: 'vpce-0abc123456789def0',
      isolatedSubnetIds: ['subnet-0aaa111111111111a', 'subnet-0bbb222222222222b', 'subnet-0ccc333333333333c'],
    });
  });

  test('throws when EXISTING_ISOLATED_SUBNET_IDS has fewer than 2 subnet IDs', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-0abc123456789def0';
    process.env.EXISTING_ISOLATED_SUBNET_IDS = 'subnet-0aaa111111111111a';

    expect(() => getExistingVpcConfig()).toThrow(/at least 2 comma-separated subnet IDs/);
  });

  test('warns (but does not throw) when isolated subnets are omitted', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-0abc123456789def0';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(getExistingVpcConfig()).toEqual({
      vpcId: 'vpc-12345678',
      apiGwVpcEndpointId: 'vpce-0abc123456789def0',
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('EXISTING_ISOLATED_SUBNET_IDS'));

    warnSpy.mockRestore();
  });

  test('throws on malformed EXISTING_VPC_ID', () => {
    process.env.EXISTING_VPC_ID = 'not-a-vpc-id';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-0abc123456789def0';

    expect(() => getExistingVpcConfig()).toThrow(/EXISTING_VPC_ID must be a valid VPC ID/);
  });

  test('throws on malformed EXISTING_API_GW_VPC_ENDPOINT_ID', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-XYZ';

    expect(() => getExistingVpcConfig()).toThrow(/must be a valid VPC endpoint ID/);
  });

  test('throws on malformed subnet ID in EXISTING_ISOLATED_SUBNET_IDS', () => {
    process.env.EXISTING_VPC_ID = 'vpc-12345678';
    process.env.EXISTING_API_GW_VPC_ENDPOINT_ID = 'vpce-0abc123456789def0';
    process.env.EXISTING_ISOLATED_SUBNET_IDS = 'subnet-0aaa111111111111a,bogus';

    expect(() => getExistingVpcConfig()).toThrow(/Invalid subnet ID in EXISTING_ISOLATED_SUBNET_IDS/);
  });
});
