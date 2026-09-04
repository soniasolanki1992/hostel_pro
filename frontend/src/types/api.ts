/**
 * API Type Definitions for Hostel Management System
 *
 * This file defines TypeScript interfaces for all API request/response contracts.
 * Shared between API routes and frontend components for type safety.
 *
 * @see .docs/api-routes-audit.md for complete API documentation
 */

// ============================================================================
// Common Types
// ============================================================================

export type ApiResponse<T = any> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

export type PaginationParams = {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

// ============================================================================
// Enums matching db.json schema
// ============================================================================

export enum UserRole {
  STUDENT = 'STUDENT',
  SUPERINTENDENT = 'SUPERINTENDENT',
  TRUSTEE = 'TRUSTEE',
  ACCOUNTS = 'ACCOUNTS',
  PARENT = 'PARENT',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum ApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  REVIEW = 'REVIEW',
  TRUSTEE_REVIEW = 'TRUSTEE_REVIEW',
  SHORTLISTED = 'SHORTLISTED',
  INTERVIEW = 'INTERVIEW',
  TRUSTEE_FINAL_REVIEW = 'TRUSTEE_FINAL_REVIEW',
  WAITLIST = 'WAITLIST',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  ARCHIVED = 'ARCHIVED',
}

export enum ApplicationType {
  NEW = 'NEW',
  RENEWAL = 'RENEWAL',
}

export enum Vertical {
  BOYS_HOSTEL = 'BOYS_HOSTEL',
  GIRLS_ASHRAM = 'GIRLS_ASHRAM',
  DHARAMSHALA = 'DHARAMSHALA',
}

export enum DocumentType {
  AADHAR_CARD = 'AADHAR_CARD',
  PHOTO = 'PHOTO',
  EDUCATION_CERT = 'EDUCATION_CERT',
  INCOME_PROOF = 'INCOME_PROOF',
  CASTE_CERT = 'CASTE_CERT',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum InterviewMode {
  IN_PERSON = 'IN_PERSON',
  VIDEO_CALL = 'VIDEO_CALL',
}

export enum InterviewStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum RoomStatus {
  AVAILABLE = 'AVAILABLE',
  FULL = 'FULL',
  MAINTENANCE = 'MAINTENANCE',
}

export enum AllocationStatus {
  ACTIVE = 'ACTIVE',
  VACATED = 'VACATED',
}

export enum LeaveType {
  HOME_VISIT = 'HOME_VISIT',
  MEDICAL = 'MEDICAL',
  EMERGENCY = 'EMERGENCY',
  OTHER = 'OTHER',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum FeeHead {
  HOSTEL_FEES = 'HOSTEL_FEES',
  SECURITY_DEPOSIT = 'SECURITY_DEPOSIT',
  PROCESSING_FEE = 'PROCESSING_FEE',
  MESS_FEES = 'MESS_FEES',
  MAINTENANCE = 'MAINTENANCE',
}

export enum FeeStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CASH = 'CASH',
  CARD = 'CARD',
}

export enum TransactionStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

// ============================================================================
// Authentication API Types
// ============================================================================

export namespace AuthAPI {
  // POST /api/auth/login
  export type LoginRequest = {
    username: string; // email, mobile, or username
    password: string;
  };

  export type LoginResponse = {
    success: boolean;
    role: UserRole;
    token: string;
    userId: string;
    requiresPasswordChange?: boolean;
    vertical?: Vertical;
    message?: string;
    error?: string;
  };

  // POST /api/auth/first-time-setup
  export type FirstTimeSetupRequest = {
    token: string;
    newPassword: string;
    dpdpConsent: boolean;
  };

  export type FirstTimeSetupResponse = {
    success: boolean;
    role: UserRole;
    message?: string;
    error?: string;
  };

  // POST /api/auth/forgot-password
  export type ForgotPasswordRequest = {
    contact: string; // email or mobile
  };

  export type ForgotPasswordResponse = {
    success: boolean;
    token: string;
    message: string;
  };

  // POST /api/auth/reset-password
  export type ResetPasswordRequest = {
    token: string;
    otp: string;
    newPassword: string;
  };

  export type ResetPasswordResponse = {
    success: boolean;
    message: string;
  };

  // POST /api/auth/logout
  export type LogoutRequest = {
    token: string;
  };

  export type LogoutResponse = {
    success: boolean;
    message: string;
  };

  // GET /api/auth/session
  export type SessionResponse = {
    success: boolean;
    userId: string;
    role: UserRole;
    vertical?: Vertical;
  };
}

// ============================================================================
// OTP API Types (Already Implemented)
// ============================================================================

export namespace OTPAPI {
  // POST /api/otp/send
  export type SendRequest = {
    phone?: string;
    email?: string;
    vertical: string;
  };

  export type SendResponse = {
    success: boolean;
    token: string;
    expiresIn: number;
    message: string;
    devOTP?: string; // Only in development
  };

  // POST /api/otp/verify
  export type VerifyRequest = {
    code: string;
    token: string;
    attempts: number;
    userAgent?: string;
  };

  export type VerifyResponse = {
    success: boolean;
    sessionToken: string;
    message: string;
    redirect: string;
  };

  // POST /api/otp/resend
  export type ResendRequest = {
    token: string;
    reason: string;
  };

  export type ResendResponse = {
    success: boolean;
    token: string;
    expiresIn: number;
    message: string;
    devOTP?: string; // Only in development
  };
}

// ============================================================================
// Application API Types
// ============================================================================

export namespace ApplicationAPI {
  export type ApplicationData = {
    personal_info: {
      full_name: string;
      age: number;
      native_place: string;
      mobile?: string;
      email?: string;
      [key: string]: any;
    };
    guardian_info: {
      father_name: string;
      father_mobile?: string;
      mother_name?: string;
      address?: string;
      [key: string]: any;
    };
    education?: {
      institution: string;
      course: string;
      year: string;
      [key: string]: any;
    };
    stay_duration?: {
      from: string;
      to: string;
      purpose: string;
    };
    [key: string]: any;
  };

  export type Application = {
    id: string;
    tracking_number: string;
    type: ApplicationType;
    parent_application_id: string | null;
    applicant_mobile: string;
    student_user_id: string | null;
    current_status: ApplicationStatus;
    vertical: Vertical;
    data: ApplicationData;
    submitted_at: string | null;
    created_at: string;
    updated_at?: string;
  };

  // GET /api/applications
  export type ListRequest = PaginationParams & {
    status?: ApplicationStatus;
    vertical?: Vertical;
    type?: ApplicationType;
  };

  export type ListResponse = PaginatedResponse<Application>;

  // POST /api/applications
  export type CreateRequest = {
    type: ApplicationType;
    vertical: Vertical;
    applicant_mobile: string;
    data: ApplicationData;
    status?: ApplicationStatus;
  };

  export type CreateResponse = {
    success: boolean;
    data: Application;
  };

  // GET /api/applications/[id]
  export type GetResponse = {
    success: boolean;
    data: Application;
  };

  // PUT /api/applications/[id]
  export type UpdateRequest = Partial<{
    data: Partial<ApplicationData>;
    current_status: ApplicationStatus;
  }>;

  export type UpdateResponse = {
    success: boolean;
    data: Application;
  };

  // POST /api/applications/[id]/submit
  export type SubmitResponse = {
    success: boolean;
    data: Application;
    message: string;
  };

  // GET /api/applications/track/[trackingNumber]
  export type TrackResponse = {
    success: boolean;
    data: Application;
  };
}

// ============================================================================
// Interview API Types
// ============================================================================

export namespace InterviewAPI {
  export type Interview = {
    id: string;
    application_id: string;
    trustee_id: string;
    schedule_time: string;
    mode: InterviewMode;
    internal_remarks?: string;
    final_score: number | null;
    status: InterviewStatus;
  };

  // GET /api/interviews
  export type ListRequest = PaginationParams & {
    application_id?: string;
    trustee_id?: string;
    status?: InterviewStatus;
  };

  export type ListResponse = PaginatedResponse<Interview>;

  // POST /api/interviews
  export type CreateRequest = {
    application_id: string;
    trustee_id: string;
    schedule_time: string;
    mode: InterviewMode;
  };

  export type CreateResponse = {
    success: boolean;
    data: Interview;
  };

  // GET /api/interviews/slots
  export type SlotsRequest = {
    date: string;
    trustee_id?: string;
  };

  export type SlotsResponse = {
    success: boolean;
    slots: Array<{
      time: string;
      available: boolean;
    }>;
  };

  // PUT /api/interviews/[id]/reschedule
  export type RescheduleRequest = {
    schedule_time: string;
  };

  export type RescheduleResponse = {
    success: boolean;
    data: Interview;
  };

  // PUT /api/interviews/[id]/complete
  export type CompleteRequest = {
    final_score: number;
    internal_remarks: string;
  };

  export type CompleteResponse = {
    success: boolean;
    data: Interview;
  };
}

// ============================================================================
// Fee & Payment API Types
// ============================================================================

export namespace FeeAPI {
  export type Fee = {
    id: string;
    student_id: string;
    head: FeeHead;
    amount: number;
    due_date: string;
    status: FeeStatus;
    paid_at: string | null;
  };

  // GET /api/fees
  export type ListRequest = {
    student_id?: string;
    status?: FeeStatus;
  };

  export type ListResponse = {
    success: boolean;
    data: Fee[];
    summary?: {
      total_pending: number;
      total_paid: number;
      total_overdue: number;
    };
  };
}

export namespace PaymentAPI {
  export type Transaction = {
    id: string;
    fee_id: string;
    amount: number;
    payment_method: PaymentMethod;
    transaction_id: string;
    status: TransactionStatus;
    created_at: string;
  };

  // POST /api/payments
  export type InitiateRequest = {
    fee_id: string;
    payment_method: PaymentMethod;
    amount: number;
  };

  export type InitiateResponse = {
    success: boolean;
    transaction_id: string;
    payment_url?: string; // For UPI/online payments
  };

  // POST /api/payments/verify
  export type VerifyRequest = {
    transaction_id: string;
  };

  export type VerifyResponse = {
    success: boolean;
    status: TransactionStatus;
    data: Transaction;
  };

  // GET /api/payments/receipt/[transactionId]
  export type ReceiptResponse = {
    success: boolean;
    receipt_url: string;
    data: Transaction & {
      fee: FeeAPI.Fee;
      student_name: string;
    };
  };
}

// ============================================================================
// Room & Allocation API Types
// ============================================================================

export namespace RoomAPI {
  export type Room = {
    id: string;
    room_number: string;
    vertical: Vertical;
    floor: number;
    capacity: number;
    current_occupancy: number;
    status: RoomStatus;
  };

  // GET /api/rooms
  export type ListRequest = {
    vertical?: Vertical;
    floor?: number;
    status?: RoomStatus;
  };

  export type ListResponse = {
    success: boolean;
    data: Room[];
  };
}

export namespace AllocationAPI {
  export type Allocation = {
    id: string;
    student_id: string;
    room_id: string;
    allocated_at: string;
    vacated_at: string | null;
    status: AllocationStatus;
  };

  // POST /api/allocations
  export type CreateRequest = {
    student_id: string;
    room_id: string;
  };

  export type CreateResponse = {
    success: boolean;
    data: Allocation;
  };

  // PUT /api/allocations/vacate/[id]
  export type VacateResponse = {
    success: boolean;
    data: Allocation;
  };
}

// ============================================================================
// Leave API Types
// ============================================================================

export namespace LeaveAPI {
  export type Leave = {
    id: string;
    student_id: string;
    type: LeaveType;
    start_time: string;
    end_time: string;
    reason: string;
    status: LeaveStatus;
    parent_notified_at: string | null;
    created_at: string;
  };

  // GET /api/leaves
  export type ListRequest = PaginationParams & {
    student_id?: string;
    status?: LeaveStatus;
  };

  export type ListResponse = PaginatedResponse<Leave>;

  // POST /api/leaves
  export type CreateRequest = {
    student_id: string;
    type: LeaveType;
    start_time: string;
    end_time: string;
    reason: string;
  };

  export type CreateResponse = {
    success: boolean;
    data: Leave;
  };

  // PUT /api/leaves/[id]/approve
  export type ApproveResponse = {
    success: boolean;
    data: Leave;
  };

  // PUT /api/leaves/[id]/reject
  export type RejectRequest = {
    reason: string;
  };

  export type RejectResponse = {
    success: boolean;
    data: Leave;
  };
}

// ============================================================================
// Dashboard API Types
// ============================================================================

export namespace DashboardAPI {
  export type StudentDashboard = {
    profile: {
      name: string;
      vertical: Vertical;
      room: string;
      joining_date: string;
    };
    fees: {
      pending: number;
      overdue: number;
      upcoming_due_date: string | null;
    };
    leaves: {
      approved_count: number;
      pending_count: number;
      upcoming: LeaveAPI.Leave[];
    };
    notifications: Array<{
      id: string;
      message: string;
      created_at: string;
    }>;
  };

  export type SuperintendentDashboard = {
    applications: {
      pending_review: number;
      total_this_month: number;
      by_status: Record<ApplicationStatus, number>;
    };
    occupancy: {
      total_capacity: number;
      current_occupancy: number;
      percentage: number;
    };
    recent_applications: ApplicationAPI.Application[];
  };

  export type TrusteeDashboard = {
    interviews: {
      scheduled: number;
      completed_this_month: number;
      upcoming: InterviewAPI.Interview[];
    };
    applications: {
      awaiting_approval: number;
    };
  };

  export type AccountsDashboard = {
    payments: {
      collected_this_month: number;
      pending: number;
      overdue: number;
    };
    recent_transactions: PaymentAPI.Transaction[];
  };

  export type ParentDashboard = {
    student: {
      name: string;
      vertical: Vertical;
      room: string;
      joining_date: string;
    };
    fees: FeeAPI.Fee[];
    leaves: LeaveAPI.Leave[];
    notifications: Array<{
      id: string;
      message: string;
      created_at: string;
    }>;
  };
}

// ============================================================================
// User & Profile API Types
// ============================================================================

export namespace UserAPI {
  export type User = {
    id: string;
    email: string;
    role: UserRole;
    mobile_no: string;
    status: UserStatus;
    created_at: string;
  };

  export type Profile = {
    id: string;
    user_id: string;
    full_name: string;
    profile_type: 'STUDENT' | 'STAFF';
    details: Record<string, any>;
  };

  // GET /api/users/profile
  export type GetProfileResponse = {
    success: boolean;
    user: User;
    profile: Profile;
  };

  // PUT /api/users/profile/update
  export type UpdateProfileRequest = {
    full_name?: string;
    details?: Record<string, any>;
  };

  export type UpdateProfileResponse = {
    success: boolean;
    profile: Profile;
  };

  // POST /api/users/change-password
  export type ChangePasswordRequest = {
    current_password: string;
    new_password: string;
  };

  export type ChangePasswordResponse = {
    success: boolean;
    message: string;
  };
}
