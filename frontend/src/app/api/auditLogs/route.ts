import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  successResponse,
  serverErrorResponse,
} from '@/lib/api/responses';
import { requireAuth } from '@/lib/authorize';

/**
 * GET /api/auditLogs
 * List audit logs for compliance and tracking
 * Auth: SUPERINTENDENT, TRUSTEE
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request, ['SUPERINTENDENT', 'TRUSTEE']);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entity_type');
    const action = searchParams.get('action');
    const limitParam = parseInt(searchParams.get('limit') || '200', 10);
    const limit = Math.min(Math.max(limitParam, 1), 500);

    let sql = `
      SELECT al.*,
             u.full_name AS performer_name, u.role AS performer_role,
             a.tracking_number, a.applicant_name, a.vertical AS app_vertical,
             eu.full_name AS entity_user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.performed_by = u.id
      LEFT JOIN applications a ON al.entity_type = 'APPLICATION' AND al.entity_id = a.id
      LEFT JOIN users eu ON al.entity_type = 'USER' AND al.entity_id = eu.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (entityType) {
      sql += ` AND al.entity_type = $${paramIndex++}`;
      params.push(entityType.toUpperCase());
    }
    if (action) {
      sql += ` AND al.action = $${paramIndex++}`;
      params.push(action.toUpperCase());
    }

    sql += ` ORDER BY al.performed_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows: logs } = await query(sql, params);

    // Classify and transform logs
    const APPROVAL_ACTIONS = ['STATUS_CHANGE', 'APPROVAL', 'REJECTION'];
    const CONSENT_ACTIONS = ['PASSWORD_CHANGE'];

    const transformedLogs = (logs || []).map((log: any) => {
      const meta = log.metadata || {};
      const isApproval = APPROVAL_ACTIONS.includes(log.action) &&
        (log.entity_type === 'APPLICATION' || log.entity_type === 'INTERVIEW');
      const isConsent = CONSENT_ACTIONS.includes(log.action) ||
        (meta.dpdp_consent !== undefined);

      // Determine decision from status change
      let decision = 'PENDING';
      if (meta.new_status === 'APPROVED') decision = 'APPROVED';
      else if (meta.new_status === 'REJECTED') decision = 'REJECTED';
      else if (meta.new_status === 'WITHDRAWN') decision = 'RETURNED';
      else if (meta.new_status) decision = 'PENDING';

      return {
        id: log.id,
        timestamp: log.performed_at,
        date_time: log.performed_at,
        log_type: isApproval ? 'APPROVAL' : isConsent ? 'CONSENT' : 'GENERAL',
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        entity_title: meta.tracking_number || log.tracking_number || `${log.entity_type}-${String(log.entity_id).slice(0, 8)}`,
        // Approval history fields
        student_id: log.entity_type === 'APPLICATION' ? log.entity_id : null,
        student_name: log.applicant_name || log.entity_user_name || meta.applicant_name || null,
        authority: log.performer_name
          ? { name: log.performer_name, role: log.performer_role || 'SYSTEM' }
          : { name: 'System', role: 'SYSTEM' },
        decision,
        previous_status: meta.old_status || null,
        new_status: meta.new_status || null,
        remarks: meta.remarks || meta.reason || null,
        vertical: log.app_vertical || meta.vertical || null,
        // Consent fields
        consent_type: meta.dpdp_consent ? 'DPDP_CONSENT' : log.action === 'PASSWORD_CHANGE' ? 'PASSWORD_CHANGE' : null,
        parent_name: meta.parent_name || null,
        method: meta.method || 'DIGITAL',
        // General fields
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        details: meta,
        status: isConsent ? 'ACTIVE' : undefined,
        version: '1.0',
      };
    });

    return successResponse(transformedLogs);
  } catch (error: any) {
    if (error instanceof NextResponse) return error;
    console.error('Error in GET /api/auditLogs:', error);
    return successResponse([]);
  }
}
