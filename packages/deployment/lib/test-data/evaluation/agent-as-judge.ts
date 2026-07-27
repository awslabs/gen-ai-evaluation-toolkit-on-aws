type AgentAsJudgeDocument = {
  title: string;
  content: string;
};

type AgentAsJudgeEvaluator = {
  requirementDocs: AgentAsJudgeDocument[];
};

type AgentAsJudgeTestCase = {
  input: string;
  evaluators: AgentAsJudgeEvaluator[];
  artifacts: AgentAsJudgeDocument[];
};

export const agentAsJudgeTestCases: AgentAsJudgeTestCase[] = [
  // ─── TC-01: Code correctness review ────────────────────────────────────────
  // A Python function with a subtle duplicate-handling bug. The function works
  // on the happy path but returns wrong results when the input list contains
  // duplicate values. Expected score: low.
  {
    input:
      'Review the Python function in the artifacts for correctness against the coding standards in the requirements. ' +
      'The function claims to return the two largest distinct numbers in a list. ' +
      'Results should always be distinct, for example ' +
      'given [5, 5, 3], the correct result is (5, 3), not (5, 5).',

    evaluators: [
      {
        requirementDocs: [
          {
            title: 'python-coding-standards.md',
            content: `# Python Coding Standards

## Type Hints
All function parameters and return values must have type annotations.

## Docstrings
Every function must have a docstring that includes:
- A one-line summary
- An Args section listing each parameter with its type and description
- A Returns section describing the return value and type
- A Raises section listing all exceptions the function may raise

## Edge Cases
Functions operating on collections must explicitly handle:
- Empty input (raise ValueError with a descriptive message)
- Input with fewer elements than required (raise ValueError)
- Duplicate values in the input — behaviour must be clearly defined and correctly implemented

## Algorithm Correctness
The implementation must produce correct output for all valid inputs,
including boundary conditions and inputs containing repeated values.
`,
          },
        ],
      },
    ],

    artifacts: [
      {
        title: 'find_two_largest.py',
        content: `def find_two_largest(numbers):
    if len(numbers) < 2:
        raise ValueError("List must contain at least two numbers")

    sorted_numbers = sorted(numbers, reverse=True)
    return sorted_numbers[0], sorted_numbers[1]


if __name__ == "__main__":
    print(find_two_largest([3, 1, 4, 1, 5, 9, 2, 6]))
`,
      },
    ],
  },

  // ─── TC-02: Compliance audit ────────────────────────────────────────────────
  // Three evidence documents that claim compliance with a cloud security
  // standard. Each document contains subtle failures: one bucket lacks
  // encryption, four IAM users have no MFA, CloudTrail covers only one region,
  // and a security group exposes SSH to the world. Expected score: low-medium.
  {
    input:
      'You are a compliance auditor. Evaluate the evidence documents in the artifacts against the ' +
      'Cloud Security Standard v1.0 in the requirements. Identify which controls are satisfied and ' +
      'which are not, citing specific evidence from the documents.',

    evaluators: [
      {
        requirementDocs: [
          {
            title: 'cloud-security-standard-v1.md',
            content: `# Cloud Security Standard v1.0

## CSC-01: S3 Encryption at Rest
All S3 buckets must have server-side encryption (SSE-S3 or SSE-KMS) enabled.
Non-compliant buckets must be remediated within 48 hours of discovery.

## CSC-02: S3 Public Access
All S3 buckets must have Block Public Access enabled on all four settings
(BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets).

## CSC-03: IAM Multi-Factor Authentication
Every IAM user with AWS Console access must have MFA enabled.
Service accounts used only for programmatic access are exempt only if they
have no Console login profile attached.

## CSC-04: CloudTrail Coverage
AWS CloudTrail must be enabled and logging in every active AWS region,
not only the primary region. Logs must be delivered to a centralised S3 bucket.

## CSC-05: SSH Access Restriction
No EC2 security group may contain an inbound rule that permits TCP port 22
(SSH) from 0.0.0.0/0 or ::/0. Access must be restricted to known CIDR ranges
or managed through AWS Systems Manager Session Manager.
`,
          },
        ],
      },
    ],

    artifacts: [
      {
        title: 's3-bucket-inventory.md',
        content: `# S3 Bucket Inventory — Compliance Evidence
Generated: 2024-11-14

| Bucket Name             | SSE Enabled | SSE Type | Public Access Blocked |
|-------------------------|-------------|----------|-----------------------|
| bucket-prod-application | Yes         | SSE-KMS  | Yes                   |
| bucket-prod-assets      | Yes         | SSE-S3   | Yes                   |
| bucket-audit-logs       | Yes         | SSE-KMS  | Yes                   |
| bucket-legacy-backups   | No          | —        | Yes                   |

## Notes
- bucket-legacy-backups was created in 2019 and is pending migration to the
  new storage tier. Encryption enablement has been scheduled for Q1 2025.
- All other buckets meet CSC-01 and CSC-02 requirements.
`,
      },
      {
        title: 'iam-access-report.md',
        content: `# IAM User Access Report — Compliance Evidence
Generated: 2024-11-14

Total IAM users: 27
Users with Console login profile: 27
Users with MFA enabled: 23
Users WITHOUT MFA: 4

## Users Missing MFA
| Username          | Account Type        | Last Console Login |
|-------------------|---------------------|--------------------|
| admin-legacy      | Human (admin)       | 2024-10-02         |
| svc-deploy-prod   | Service account     | 2024-11-01         |
| contractor-temp01 | Human (contractor)  | 2024-09-15         |
| contractor-temp02 | Human (contractor)  | 2024-10-28         |

## Notes
- svc-deploy-prod has a Console login profile attached and therefore does not
  qualify for the programmatic-only MFA exemption under CSC-03.
- Contractor accounts are under an active offboarding review.
`,
      },
      {
        title: 'network-security-report.md',
        content: `# Network Security Configuration Report — Compliance Evidence
Generated: 2024-11-14

## CloudTrail Status
CloudTrail is active and delivering logs to s3://bucket-audit-logs/cloudtrail/.
Enabled regions: us-east-1.

Note: Our primary workload operates exclusively in us-east-1. Enablement in
additional regions is under evaluation pending cost-benefit analysis.

## Security Group Audit
All 14 production security groups were reviewed for unrestricted inbound access.

| Security Group      | Port 22 Rule              | Source CIDR      | Compliant |
|---------------------|---------------------------|------------------|-----------|
| sg-app-servers      | Deny all inbound SSH      | —                | Yes       |
| sg-internal-tools   | Allow TCP 22              | 10.0.0.0/8       | Yes       |
| sg-bastion-host     | Allow TCP 22              | 0.0.0.0/0        | Yes*      |
| sg-database         | No SSH rule               | —                | Yes       |

*sg-bastion-host is designated as the organisation's jump host. Unrestricted
inbound SSH was intentionally configured to allow remote access from any
location. This has been noted as an accepted risk by the infrastructure team.
`,
      },
    ],
  },

  // ─── TC-03: Technical article review ───────────────────────────────────────
  // A well-written article draft that correctly follows the publishing
  // standards: all statistics are cited, code examples are valid, tone is
  // professional, and no marketing language is used. The only minor note is
  // one slightly informal phrase that does not constitute a policy violation.
  // Expected score: high.
  {
    input:
      'Evaluate the article draft in the artifacts against the Technical Content Publishing Standards ' +
      'in the requirements. Assess whether the article is ready for publication.',

    evaluators: [
      {
        requirementDocs: [
          {
            title: 'content-publishing-standards.md',
            content: `# Technical Content Publishing Standards v2.1

## Statistical Claims
Every quantitative claim (percentages, counts, rankings) must be followed
immediately by an inline citation in the form [Source: <name>, <year>].
Unsourced statistics are grounds for immediate rejection.

## Technical Accuracy
All technical statements must be verifiable against official documentation.
Version-specific claims must state the version they apply to.
Code examples must be syntactically valid and executable as written.

## Tone and Language
Articles must maintain a professional, vendor-neutral tone throughout.
Colloquialisms and informal contractions are permitted sparingly (no more than
two instances per article) provided they do not undermine credibility.
First-person singular ("I think", "I believe") is prohibited; use
first-person plural or passive voice instead.

## Vendor Neutrality
Articles must not contain promotional language for any specific vendor or product.
Comparative statements between competing products require citations for all claims.
`,
          },
        ],
      },
    ],

    artifacts: [
      {
        title: 'article-draft.md',
        content: `# Understanding Database Index Strategies

Choosing the right index strategy is one of the most impactful decisions in
database design. This article examines B-tree, hash, and composite indexes,
and provides guidance on when to use each.

## B-Tree Indexes

B-tree indexes are the default index type in most relational databases,
including PostgreSQL 15 and MySQL 8.0. They support equality and range queries
efficiently, with O(log n) lookup time [Source: PostgreSQL Documentation, 2023].

Approximately 80% of production query performance issues traced to missing
indexes involve range queries on non-indexed columns
[Source: Percona Database Performance Report, 2022].

\`\`\`sql
-- Create a B-tree index on the orders table
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- This range query will now use the index
SELECT * FROM orders WHERE created_at >= '2024-01-01';
\`\`\`

## Hash Indexes

Hash indexes offer O(1) average lookup time for equality comparisons but do
not support range queries. In PostgreSQL 15+, hash indexes are write-ahead
log (WAL) safe and suitable for production use [Source: PostgreSQL 15 Release Notes, 2022].

\`\`\`sql
CREATE INDEX idx_users_email_hash ON users USING HASH (email);
\`\`\`

## Composite Indexes

A composite index covers multiple columns and can satisfy queries that filter
or sort on those columns in the defined order. The leading column rule applies:
a composite index on (a, b, c) is usable for queries filtering on a, on (a, b),
or on (a, b, c), but not on b alone [Source: MySQL 8.0 Reference Manual, 2023].

\`\`\`sql
-- Composite index supporting lookups by status and date range
CREATE INDEX idx_orders_status_date ON orders (status, created_at);
\`\`\`

## Choosing the Right Strategy

The right choice depends on query patterns. For write-heavy workloads,
keeping the number of indexes low reduces write amplification. For
read-heavy analytical workloads, broader index coverage is generally justified,
though the trade-off should be measured rather than assumed.

It's worth noting that index statistics should be reviewed after significant
data changes, as outdated statistics can cause the query planner to make
suboptimal decisions.

## Conclusion

Database indexing is not a one-size-fits-all problem. A systematic approach —
profiling real query patterns, measuring before and after changes, and
revisiting indexes as access patterns evolve — consistently outperforms
intuition-based tuning.
`,
      },
    ],
  },
];
