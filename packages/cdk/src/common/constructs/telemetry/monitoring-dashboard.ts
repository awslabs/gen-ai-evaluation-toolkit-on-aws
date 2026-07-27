import {
  Aws,
  aws_cloudwatch as cw,
  aws_dynamodb as ddb,
  aws_lambda as lambda,
  aws_stepfunctions as sfn,
} from 'aws-cdk-lib';
import { Construct, Node } from 'constructs';
import {
  ApiGatewayMetricFactory,
  CustomMetric,
  CustomMetricGroup,
  LatencyType,
  MetricFactory,
  MonitoringFacade,
  RateComputationMethod,
  SqsQueueMetricFactory,
  MetricWithAlarmSupport,
  MetricStatistic,
  LambdaFunctionMetricFactory,
  CustomThreshold,
  DefaultDashboardFactory,
  StepFunctionMetricFactory,
} from 'cdk-monitoring-constructs';

import { ServiceMonitorConfig } from './types';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';

export interface DashboardProps {
  /**
   * An array of AWS resources, one for each service, to be monitored
   */
  readonly monitorConfigs: ServiceMonitorConfig[];
}

/**
 * The CDK construct for GenAiETK Monitoring and Alarm Service which
 * created a Monitoring dashboard and alarms for the deployed AWS resources.
 */
export class GenAiEtkDashboard extends Construct {
  private readonly monitoring: MonitoringFacade;
  private metricFactory: MetricFactory;
  private dashboardFactory: DefaultDashboardFactory;

  private widgetHeight = 4;

  constructor(scope: Construct, id: string, { monitorConfigs }: DashboardProps) {
    super(scope, id);
    this.metricFactory = new MetricFactory(scope);

    this.dashboardFactory = new DefaultDashboardFactory(this, 'MonitoringDashboardFactory', {
      dashboardNamePrefix: `MonitoringDashboard-${Aws.REGION}`,
    });

    this.monitoring = new MonitoringFacade(this, 'MonitoringDashboard', {
      dashboardFactory: this.dashboardFactory,
      alarmFactoryDefaults: {
        actionsEnabled: true,
        alarmNamePrefix: 'GenAiEtk',
      },
    });

    monitorConfigs.forEach((config) => {
      this.monitoring.addMediumHeader(config.serviceName);
      this.monitorApis(config.serviceName, config.restApiIds);
      this.monitorLambda(config.serviceName, config.lambdas);
      this.monitorDlqs(config.serviceName, config.queuePairs);
      this.monitorDDB(config.serviceName, config.tables);
      this.monitorStateMachine(config.serviceName, config.stateMachines);
    });
  }

  private formatMetricId(s: string) {
    // MetricId must start with lowercase letter and only contain alphanumerics
    return s.charAt(0).toLowerCase() + s.substring(1).replace(/[^a-zA-Z\d]/g, '');
  }

  private removeServiceName(serviceName: string, s: string) {
    return s.replace(serviceName, '');
  }

  private createAlarmConfigs(
    serviceName: string,
    metricType: keyof AllAlarmsThreshold,
    resource: string | { node: Node },
    alarmName = '',
  ): {
    alarmFriendlyName: string;
    addAlarm: Record<keyof AlarmThreshold, CustomThreshold>;
  } {
    const humanReadableAlarmName = alarmName.replace(/([a-zX])([A-WYZ])/g, '$1 $2');
    const alarmResource = typeof resource === 'string' ? resource : resource.node.id;
    const alarmFriendlyName = `${alarmResource} ${humanReadableAlarmName} Alarm`;
    const alarmNameOverridePrefix = `${serviceName}${alarmResource}${alarmName}Alarm`;
    const customThreshold: Pick<CustomThreshold, 'comparisonOperator' | 'treatMissingDataOverride'> = {
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingDataOverride: cw.TreatMissingData.IGNORE,
    };
    const addAlarm: Record<keyof AlarmThreshold, CustomThreshold> = {
      Warning: {
        ...customThreshold,
        alarmNameOverride: `${alarmNameOverridePrefix}Warning`,
        threshold: DEFAULT_THRESHOLDS[metricType].Warning,
      },
      Critical: {
        ...customThreshold,
        alarmNameOverride: `${alarmNameOverridePrefix}Critical`,
        threshold: DEFAULT_THRESHOLDS[metricType].Critical,
      },
    };
    return { alarmFriendlyName, addAlarm };
  }

  private monitorApis(serviceName: string, restApiIds: string[]) {
    const apis = restApiIds.map((api) => RestApi.fromRestApiId(this, 'ApiGateway', api));

    const error4xxMetrics: CustomMetric[] = [];
    const error5xxMetrics: CustomMetric[] = [];
    const latencyMetrics: CustomMetric[] = [];
    const tpsMetrics: CustomMetric[] = [];
    apis.forEach((api) => {
      const mf = new ApiGatewayMetricFactory(this.metricFactory, {
        api,
      });

      const labelPrefix = this.removeServiceName(serviceName, api.node.id);
      const { alarmFriendlyName, addAlarm } = this.createAlarmConfigs(
        serviceName,
        'API5XXError',
        labelPrefix,
        '5XXError',
      );
      error4xxMetrics.push(mf.metric4XXErrorRate().with({ label: `${labelPrefix} 4XX Error` }));
      error5xxMetrics.push({
        alarmFriendlyName,
        metric: mf.metric5XXFaultRate().with({ label: `${labelPrefix} 5XX Error` }),
        addAlarm,
      });
      latencyMetrics.push(
        mf.metricLatencyInMillis(LatencyType.P50).with({ label: `${labelPrefix} P50` }),
        mf.metricLatencyInMillis(LatencyType.P90).with({ label: `${labelPrefix} P90` }),
        mf.metricLatencyInMillis(LatencyType.P99).with({ label: `${labelPrefix} P99` }),
      );
      tpsMetrics.push(
        // Calling `metricTps` directly causing duplicate metricId error
        this.metricFactory
          .toRate(
            mf.metricInvocationCount(),
            RateComputationMethod.PER_SECOND,
            false,
            this.formatMetricId(`${api.node.id}Requests`),
            true,
          )
          .with({ label: labelPrefix, unit: cw.Unit.COUNT }),
      );
    });

    const metricGroups: CustomMetricGroup[] = [];
    const graphWidgetLegend = cw.LegendPosition.RIGHT;
    [
      {
        title: '4XX Errors',
        metrics: error4xxMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
      {
        title: '5XX Errors',
        metrics: error5xxMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
      {
        title: 'Latency',
        metrics: latencyMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Milliseconds' },
      },
      { title: 'TPS', metrics: tpsMetrics, graphWidgetAxis: { showUnits: false, label: 'Count' } },
    ].forEach(({ title, metrics, graphWidgetAxis }) => {
      if (metrics.length)
        metricGroups.push({
          title,
          metrics,
          graphWidgetLegend,
          graphWidgetAxis,
        });
    });
    if (metricGroups.length) {
      this.monitoring.monitorCustom({
        height: this.widgetHeight,
        humanReadableName: 'API',
        alarmFriendlyName: 'API',
        metricGroups,
      });
    }
  }

  private monitorLambda(serviceName: string, maybeLambdas: ServiceMonitorConfig['lambdas']) {
    const lambdas: lambda.IFunction[] = maybeLambdas?.filter((x): x is lambda.IFunction => !!x) ?? [];
    const tpsMetrics: CustomMetric[] = [];
    const latencyMetrics: CustomMetric[] = [];
    const errorMetrics: CustomMetric[] = [];
    const throttleMetrics: CustomMetric[] = [];

    lambdas.forEach((lambdaFunction) => {
      const labelPrefix = lambdaFunction.node.id;
      const mf = new LambdaFunctionMetricFactory(this.metricFactory, {
        lambdaFunction,
      });

      tpsMetrics.push(
        // Calling `metricTps` directly causing duplicate metricId error
        this.metricFactory
          .toRate(
            mf.metricInvocationCount(),
            RateComputationMethod.PER_SECOND,
            false,
            this.formatMetricId(`${lambdaFunction.node.id}Requests`),
            true,
          )
          .with({ label: labelPrefix, unit: cw.Unit.COUNT }),
      );
      latencyMetrics.push(
        mf.metricLatencyInMillis(LatencyType.P50).with({ label: `${labelPrefix} P50` }),
        mf.metricLatencyInMillis(LatencyType.P90).with({ label: `${labelPrefix} P90` }),
        mf.metricLatencyInMillis(LatencyType.P99).with({ label: `${labelPrefix} P99` }),
      );
      const errorAlarm = this.createAlarmConfigs(serviceName, 'LambdaError', lambdaFunction, 'Error');
      const throttleAlarm = this.createAlarmConfigs(serviceName, 'LambdaThrottle', lambdaFunction, 'Throttle');
      errorMetrics.push({
        alarmFriendlyName: errorAlarm.alarmFriendlyName,
        metric: mf.metricFaultRate().with({ label: `${labelPrefix} Errors` }),
        addAlarm: errorAlarm.addAlarm,
      });
      throttleMetrics.push({
        alarmFriendlyName: throttleAlarm.alarmFriendlyName,
        metric: mf.metricThrottlesRate().with({ label: `${labelPrefix} Throttles` }),
        addAlarm: throttleAlarm.addAlarm,
      });
    });

    const metricGroups: CustomMetricGroup[] = [];
    const graphWidgetLegend = cw.LegendPosition.RIGHT;
    [
      { title: 'TPS', metrics: tpsMetrics, graphWidgetAxis: { showUnits: false, label: 'Count' } },
      {
        title: 'Latency',
        metrics: latencyMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Milliseconds' },
      },
      {
        title: 'Errors',
        metrics: errorMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
      {
        title: 'Throttles',
        metrics: throttleMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
    ].forEach(({ title, metrics, graphWidgetAxis }) => {
      if (metrics.length)
        metricGroups.push({
          title,
          metrics,
          graphWidgetLegend,
          graphWidgetAxis,
        });
    });

    if (metricGroups.length) {
      this.monitoring.monitorCustom({
        height: this.widgetHeight,
        humanReadableName: 'Lambda',
        alarmFriendlyName: 'Lambda',
        metricGroups,
      });
    }
  }

  private monitorDlqs(serviceName: string, queuePairs?: ServiceMonitorConfig['queuePairs']) {
    const dlqMessagesMetrics: CustomMetric[] = [];
    const dlqOldestMessageMetrics: CustomMetric[] = [];
    queuePairs?.forEach((pair) => {
      const queue = pair.dlq;
      const mf = new SqsQueueMetricFactory(this.metricFactory, { queue });

      const { alarmFriendlyName, addAlarm } = this.createAlarmConfigs(serviceName, 'DLQ', queue);
      dlqMessagesMetrics.push({
        alarmFriendlyName: alarmFriendlyName,
        metric: mf.metricIncomingMessageCount().with({ label: queue.node.id }),
        addAlarm,
      });
      dlqOldestMessageMetrics.push(mf.metricApproximateAgeOfOldestMessageInSeconds().with({ label: queue.node.id }));
    });

    const metricGroups: CustomMetricGroup[] = [];
    const graphWidgetLegend = cw.LegendPosition.RIGHT;
    [
      {
        title: 'DLQ Messages',
        metrics: dlqMessagesMetrics,
      },
      {
        title: 'Age',
        metrics: dlqOldestMessageMetrics,
      },
    ].forEach(({ title, metrics }) => {
      if (metrics.length)
        metricGroups.push({
          title,
          metrics,
          graphWidgetLegend,
        });
    });

    if (metricGroups.length) {
      this.monitoring.monitorCustom({
        height: this.widgetHeight,
        humanReadableName: 'SQS DLQ',
        alarmFriendlyName: 'DLQ',
        metricGroups,
      });
    }
  }

  private ddbThrottleMetric(type: 'Read' | 'Write', table: ddb.ITable, gsiName?: string): MetricWithAlarmSupport {
    const dimensionsMap: cw.DimensionsMap = {
      TableName: table.tableName,
    };
    if (gsiName) dimensionsMap['GlobalSecondaryIndexName'] = gsiName;

    const metricId = this.formatMetricId(`${gsiName ?? table.node.id}${type}Throttle`);
    const m1 = this.metricFactory.createMetric(
      `${type}ThrottleEvents`,
      MetricStatistic.SUM,
      undefined,
      dimensionsMap,
      undefined,
      'AWS/DynamoDB',
    );
    return this.metricFactory.createMetricMath(`FILL(${metricId},0)`, { [metricId]: m1 }, gsiName ?? table.tableName);
  }

  // Follow DynamoTableMetricFactory.metricSystemErrorsCount from cdk-monitoring-constructs
  private ddbTableMetric(
    metricName: 'SystemErrors' | 'SuccessfulRequestLatency',
    table: ddb.ITable,
  ): MetricWithAlarmSupport {
    const crudOperations = [
      ddb.Operation.GET_ITEM,
      ddb.Operation.BATCH_GET_ITEM,
      ddb.Operation.SCAN,
      ddb.Operation.QUERY,
      ddb.Operation.GET_RECORDS,
      ddb.Operation.PUT_ITEM,
      ddb.Operation.DELETE_ITEM,
      ddb.Operation.UPDATE_ITEM,
      ddb.Operation.BATCH_WRITE_ITEM,
    ];
    const usingMetrics: Record<string, cw.IMetric> = {};

    crudOperations.forEach((operation) => {
      const metric = table.metric(metricName, {
        dimensionsMap: {
          TableName: table.tableName,
          Operation: operation,
        },
        statistic: metricName === 'SystemErrors' ? MetricStatistic.SUM : MetricStatistic.AVERAGE,
      });

      const metricId = this.formatMetricId(`${table.node.id}${metricName}${operation}`);
      usingMetrics[metricId] = this.metricFactory.adaptMetric(metric);
    });

    return this.metricFactory.createMetricMath(
      // the metric is not emitted until error happens
      metricName === 'SystemErrors' ? Object.keys(usingMetrics).join('+') : 'AVG(METRICS())',
      usingMetrics,
      table.node.id,
    );
  }

  private monitorDDB(serviceName: string, tables: ServiceMonitorConfig['tables']) {
    const latencyMetrics: CustomMetric[] = [];
    const readThrottleMetrics: CustomMetric[] = [];
    const writeThrottleMetrics: CustomMetric[] = [];
    const errorsMetrics: CustomMetric[] = [];

    tables?.forEach((ti) => {
      latencyMetrics.push(
        this.ddbTableMetric('SuccessfulRequestLatency', ti.table).with({
          unit: cw.Unit.MILLISECONDS,
        }),
      );

      const tableReadThrottleAlarm = this.createAlarmConfigs(
        serviceName,
        'DynamoDBReadThrottle',
        ti.table,
        'ReadThrottle',
      );
      const tableWriteThrottleAlarm = this.createAlarmConfigs(
        serviceName,
        'DynamoDBWriteThrottle',
        ti.table,
        'WriteThrottle',
      );
      readThrottleMetrics.push({
        metric: this.ddbThrottleMetric('Read', ti.table).with({ label: ti.table.node.id }),
        alarmFriendlyName: tableReadThrottleAlarm.alarmFriendlyName,
        addAlarm: tableReadThrottleAlarm.addAlarm,
      });
      writeThrottleMetrics.push({
        metric: this.ddbThrottleMetric('Write', ti.table).with({ label: ti.table.node.id }),
        alarmFriendlyName: tableWriteThrottleAlarm.alarmFriendlyName,
        addAlarm: tableWriteThrottleAlarm.addAlarm,
      });
      const tableErrorAlarm = this.createAlarmConfigs(serviceName, 'DynamoDBError', ti.table, 'Error');
      errorsMetrics.push({
        alarmFriendlyName: tableErrorAlarm.alarmFriendlyName,
        metric: this.ddbTableMetric('SystemErrors', ti.table).with({
          unit: cw.Unit.COUNT,
        }),
        addAlarm: tableErrorAlarm.addAlarm,
      });

      ti.gsiNames?.forEach((globalSecondaryIndexName) => {
        const labelPrefix = this.removeServiceName(serviceName, globalSecondaryIndexName);
        const gsiReadThrottleAlarm = this.createAlarmConfigs(
          serviceName,
          'DynamoDBReadThrottle',
          labelPrefix,
          'ReadThrottle',
        );
        const gsiWriteThrottleAlarm = this.createAlarmConfigs(
          serviceName,
          'DynamoDBWriteThrottle',
          labelPrefix,
          'WriteThrottle',
        );
        readThrottleMetrics.push({
          metric: this.ddbThrottleMetric('Read', ti.table, globalSecondaryIndexName).with({
            label: labelPrefix,
            unit: cw.Unit.MILLISECONDS,
          }),
          alarmFriendlyName: gsiReadThrottleAlarm.alarmFriendlyName,
          addAlarm: gsiReadThrottleAlarm.addAlarm,
        });
        writeThrottleMetrics.push({
          metric: this.ddbThrottleMetric('Write', ti.table, globalSecondaryIndexName).with({
            label: labelPrefix,
            unit: cw.Unit.MILLISECONDS,
          }),
          alarmFriendlyName: gsiWriteThrottleAlarm.alarmFriendlyName,
          addAlarm: gsiWriteThrottleAlarm.addAlarm,
        });
      });
    });

    const metricGroups: CustomMetricGroup[] = [];
    const graphWidgetLegend = cw.LegendPosition.RIGHT;
    [
      {
        title: 'Latency',
        metrics: latencyMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Milliseconds' },
      },
      {
        title: 'Read Throttles',
        metrics: readThrottleMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
      {
        title: 'Write Throttles',
        metrics: writeThrottleMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
      {
        title: 'Errors',
        metrics: errorsMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
    ].forEach(({ title, metrics, graphWidgetAxis }) => {
      if (metrics.length)
        metricGroups.push({
          title,
          metrics,
          graphWidgetLegend,
          graphWidgetAxis,
        });
    });

    if (metricGroups.length) {
      this.monitoring.monitorCustom({
        // To reduce dashboard size not showing DDB widgets
        addToDetailDashboard: false,
        height: this.widgetHeight,
        humanReadableName: 'DynamoDB',
        alarmFriendlyName: 'DynamoDB',
        metricGroups,
      });
    }
  }

  private monitorStateMachine(serviceName: string, maybeSms: ServiceMonitorConfig['stateMachines']) {
    const stateMachines: sfn.IStateMachine[] = (maybeSms ?? []).filter(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      (x): x is sfn.IStateMachine => !!x,
    );
    const failedMetrics: CustomMetric[] = [];
    const throttledMetrics: CustomMetric[] = [];
    const abortedMetrics: CustomMetric[] = [];
    const timedOutMetrics: CustomMetric[] = [];

    stateMachines.forEach((stateMachine) => {
      const labelPrefix = stateMachine.node.id;
      const mf = new StepFunctionMetricFactory(this.metricFactory, {
        stateMachine,
      });

      const failedAlarm = this.createAlarmConfigs(serviceName, 'StateMachineFailed', stateMachine, 'Failed');
      failedMetrics.push({
        ...failedAlarm,
        metric: mf.metricExecutionsFailed().with({ label: `${labelPrefix} Failed` }),
      });
      const throttledAlarm = this.createAlarmConfigs(serviceName, 'StateMachineThrottled', stateMachine, 'Throttled');
      throttledMetrics.push({
        ...throttledAlarm,
        metric: mf.metricExecutionThrottled().with({ label: `${labelPrefix} Throttled` }),
      });
      const abortedAlarm = this.createAlarmConfigs(serviceName, 'StateMachineAborted', stateMachine, 'Aborted');
      abortedMetrics.push({
        ...abortedAlarm,
        metric: mf.metricExecutionsAborted().with({ label: `${labelPrefix} Aborted` }),
      });
      const timedOutAlarm = this.createAlarmConfigs(serviceName, 'StateMachineTimedOut', stateMachine, 'TimedOut');
      timedOutMetrics.push({
        ...timedOutAlarm,
        metric: mf.metricExecutionsTimedOut().with({ label: `${labelPrefix} Timed Out` }),
      });
    });

    const metricGroups: CustomMetricGroup[] = [];
    const graphWidgetLegend = cw.LegendPosition.RIGHT;
    [
      {
        title: 'Failed',
        metrics: failedMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Rate' },
      },
      {
        title: 'Throttled',
        metrics: throttledMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Count' },
      },
      {
        title: 'Aborted',
        metrics: abortedMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Count' },
      },
      {
        title: 'Timed Out',
        metrics: timedOutMetrics,
        graphWidgetAxis: { showUnits: false, label: 'Count' },
      },
    ].forEach(({ title, metrics, graphWidgetAxis }) => {
      if (metrics.length)
        metricGroups.push({
          title,
          metrics,
          graphWidgetLegend,
          graphWidgetAxis,
        });
    });
    if (metricGroups.length) {
      this.monitoring.monitorCustom({
        height: this.widgetHeight,
        humanReadableName: 'Step Functions',
        alarmFriendlyName: 'Step Functions',
        metricGroups,
      });
    }
  }
}

interface AlarmThreshold {
  Warning: number;
  Critical: number;
}
interface AllAlarmsThreshold {
  API5XXError: AlarmThreshold;
  LambdaError: AlarmThreshold;
  LambdaThrottle: AlarmThreshold;
  DLQ: AlarmThreshold;
  DynamoDBReadThrottle: AlarmThreshold;
  DynamoDBWriteThrottle: AlarmThreshold;
  DynamoDBError: AlarmThreshold;
  StateMachineFailed: AlarmThreshold;
  StateMachineAborted: AlarmThreshold;
  StateMachineThrottled: AlarmThreshold;
  StateMachineTimedOut: AlarmThreshold;
}

const DEFAULT_THRESHOLDS: AllAlarmsThreshold = {
  API5XXError: {
    Warning: 0.01,
    Critical: 0.05,
  },
  LambdaError: {
    Warning: 0.01,
    Critical: 0.05,
  },
  LambdaThrottle: {
    Warning: 0.01,
    Critical: 0.05,
  },
  DLQ: {
    Warning: 0,
    Critical: 10,
  },
  DynamoDBReadThrottle: {
    Warning: 0.01,
    Critical: 0.05,
  },
  DynamoDBWriteThrottle: {
    Warning: 0.01,
    Critical: 0.05,
  },
  DynamoDBError: {
    Warning: 0.01,
    Critical: 0.05,
  },
  StateMachineFailed: {
    Warning: 0,
    Critical: 10,
  },
  StateMachineAborted: {
    Warning: 0,
    Critical: 10,
  },
  StateMachineThrottled: {
    Warning: 0,
    Critical: 10,
  },
  StateMachineTimedOut: {
    Warning: 0,
    Critical: 10,
  },
};
