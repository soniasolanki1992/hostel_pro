import { query } from '@/lib/db';

/**
 * GET /api/health
 *
 * Health check endpoint to verify:
 * - Environment variables are set
 * - PostgreSQL connection is working
 */
export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {},
  };

  // Check environment variables (never expose values)
  checks.checks.DATABASE_URL = {
    status: process.env.DATABASE_URL ? 'OK' : 'MISSING',
  };

  checks.checks.JWT_SECRET = {
    status: process.env.JWT_SECRET ? 'OK' : 'MISSING',
  };

  // Test PostgreSQL connection
  try {
    await query('SELECT 1');
    checks.checks.postgres_connection = {
      status: 'OK',
      message: 'Connected to PostgreSQL successfully',
    };
  } catch (error: any) {
    console.error('Health check: postgres connection error', error);
    checks.checks.postgres_connection = {
      status: 'ERROR',
      error: 'Database connection failed',
    };
  }

  // Overall status
  const allOk = Object.values(checks.checks).every(
    (check: any) => check.status === 'OK'
  );
  checks.status = allOk ? 'healthy' : 'unhealthy';

  return Response.json(checks, {
    status: allOk ? 200 : 503
  });
}
