export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      acceptance_status_transitions: {
        Row: {
          from_status: string
          to_status: string
        }
        Insert: {
          from_status: string
          to_status: string
        }
        Update: {
          from_status?: string
          to_status?: string
        }
        Relationships: []
      }
      assignment_transfers: {
        Row: {
          created_at: string
          from_assignment_id: string
          from_user_id: string
          id: string
          project_id: string
          reason: string | null
          to_assignment_id: string | null
          to_user_id: string | null
          transferred_by: string
        }
        Insert: {
          created_at?: string
          from_assignment_id: string
          from_user_id: string
          id?: string
          project_id: string
          reason?: string | null
          to_assignment_id?: string | null
          to_user_id?: string | null
          transferred_by: string
        }
        Update: {
          created_at?: string
          from_assignment_id?: string
          from_user_id?: string
          id?: string
          project_id?: string
          reason?: string | null
          to_assignment_id?: string | null
          to_user_id?: string | null
          transferred_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_transfers_from_assignment_id_fkey"
            columns: ["from_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_transfers_from_assignment_id_fkey"
            columns: ["from_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_transfers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_transfers_to_assignment_id_fkey"
            columns: ["to_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_transfers_to_assignment_id_fkey"
            columns: ["to_assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments_public"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_visibility_audience: {
        Row: {
          assignment_id: string
          audience_entity_id: string | null
          audience_user_id: string | null
          created_at: string
          id: string
        }
        Insert: {
          assignment_id: string
          audience_entity_id?: string | null
          audience_user_id?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          assignment_id?: string
          audience_entity_id?: string | null
          audience_user_id?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_visibility_audience_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_visibility_audience_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "project_assignments_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_visibility_audience_audience_entity_id_fkey"
            columns: ["audience_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      building_licenses: {
        Row: {
          authority: string | null
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          license_number: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          authority?: string | null
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id?: string
          license_number?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          authority?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          license_number?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_licenses_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "license_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_licenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_licenses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_amounts: {
        Row: {
          amount_delta: number
          change_order_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          amount_delta?: number
          change_order_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          amount_delta?: number
          change_order_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_order_amounts_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: true
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          contract_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          description: string | null
          duration_delta_days: number
          id: string
          requested_by: string
          resulting_version_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          description?: string | null
          duration_delta_days?: number
          id?: string
          requested_by: string
          resulting_version_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          description?: string | null
          duration_delta_days?: number
          id?: string
          requested_by?: string
          resulting_version_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_resulting_version_id_fkey"
            columns: ["resulting_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_resulting_version_id_fkey"
            columns: ["resulting_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_checklist_templates: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_required: boolean
          name_ar: string
          name_en: string
          order_index: number
          phase: string
          project_template_id: string
          requires_document_category: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          name_ar: string
          name_en: string
          order_index?: number
          phase: string
          project_template_id: string
          requires_document_category?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          name_ar?: string
          name_en?: string
          order_index?: number
          phase?: string
          project_template_id?: string
          requires_document_category?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closure_checklist_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_checklist_templates_requires_document_category_fkey"
            columns: ["requires_document_category"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      contract_extensions: {
        Row: {
          contract_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          reason: string | null
          requested_by: string
          requested_ends_on: string
          resulting_version_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string | null
          requested_by: string
          requested_ends_on: string
          resulting_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string | null
          requested_by?: string
          requested_ends_on?: string
          resulting_version_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_extensions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_extensions_resulting_version_id_fkey"
            columns: ["resulting_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_extensions_resulting_version_id_fkey"
            columns: ["resulting_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_parties: {
        Row: {
          acceptance_note: string | null
          accepted_at: string | null
          accepted_by: string | null
          contract_id: string
          contract_role: string
          created_at: string
          entity_id: string | null
          id: string
          project_party_id: string | null
          user_id: string | null
        }
        Insert: {
          acceptance_note?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          contract_id: string
          contract_role: string
          created_at?: string
          entity_id?: string | null
          id?: string
          project_party_id?: string | null
          user_id?: string | null
        }
        Update: {
          acceptance_note?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          contract_id?: string
          contract_role?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          project_party_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_parties_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_parties_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_parties_project_party_id_fkey"
            columns: ["project_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_stages: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          stage_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          stage_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_stages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_version_amounts: {
        Row: {
          amount: number
          created_at: string
          payment_terms: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          payment_terms?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          payment_terms?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_version_amounts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_version_amounts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "contract_versions_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_versions: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          change_reason: string | null
          contract_id: string
          created_at: string
          created_by: string
          ends_on: string | null
          file_hash: string | null
          file_path: string | null
          id: string
          source: string
          source_change_order_id: string | null
          source_extension_id: string | null
          starts_on: string | null
          terms_text: string | null
          version_no: number
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          contract_id: string
          created_at?: string
          created_by: string
          ends_on?: string | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          source?: string
          source_change_order_id?: string | null
          source_extension_id?: string | null
          starts_on?: string | null
          terms_text?: string | null
          version_no: number
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          change_reason?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string
          ends_on?: string | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          source?: string
          source_change_order_id?: string | null
          source_extension_id?: string | null
          starts_on?: string | null
          terms_text?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_source_change_order_fkey"
            columns: ["source_change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_source_extension_fkey"
            columns: ["source_extension_id"]
            isOneToOne: false
            referencedRelation: "contract_extensions"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          contract_number: string | null
          contract_type: string
          created_at: string
          created_by: string
          currency: string
          current_version_id: string | null
          deleted_at: string | null
          id: string
          project_id: string
          property_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          created_by: string
          currency?: string
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          project_id: string
          property_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          created_by?: string
          currency?: string
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          project_id?: string
          property_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence_message_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string
          id: string
          message_id: string
          mime: string | null
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path: string
          id?: string
          message_id: string
          mime?: string | null
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string
          id?: string
          message_id?: string
          mime?: string | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "correspondence_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence_message_audience: {
        Row: {
          audience_entity_id: string | null
          audience_user_id: string | null
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          audience_entity_id?: string | null
          audience_user_id?: string | null
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          audience_entity_id?: string | null
          audience_user_id?: string | null
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_message_audience_audience_entity_id_fkey"
            columns: ["audience_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_message_audience_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "correspondence_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence_messages: {
        Row: {
          author_id: string
          author_role_snapshot: string | null
          body: string
          created_at: string
          file_path: string | null
          id: string
          message_kind: string
          thread_id: string
          visibility: string
        }
        Insert: {
          author_id: string
          author_role_snapshot?: string | null
          body: string
          created_at?: string
          file_path?: string | null
          id?: string
          message_kind?: string
          thread_id: string
          visibility?: string
        }
        Update: {
          author_id?: string
          author_role_snapshot?: string | null
          body?: string
          created_at?: string
          file_path?: string | null
          id?: string
          message_kind?: string
          thread_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "correspondence_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      correspondence_threads: {
        Row: {
          contract_id: string | null
          created_at: string
          created_by: string
          id: string
          project_id: string
          stage_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          stage_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          stage_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correspondence_threads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correspondence_threads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deed_versions: {
        Row: {
          area: number | null
          created_at: string
          created_by: string
          deed_date: string | null
          deed_id: string
          extracted_payload: Json | null
          file_hash: string | null
          file_path: string | null
          id: string
          owner_name_snapshot: string | null
          source: string
          version_no: number
        }
        Insert: {
          area?: number | null
          created_at?: string
          created_by: string
          deed_date?: string | null
          deed_id: string
          extracted_payload?: Json | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          owner_name_snapshot?: string | null
          source?: string
          version_no: number
        }
        Update: {
          area?: number | null
          created_at?: string
          created_by?: string
          deed_date?: string | null
          deed_id?: string
          extracted_payload?: Json | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          owner_name_snapshot?: string | null
          source?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "deed_versions_deed_id_fkey"
            columns: ["deed_id"]
            isOneToOne: false
            referencedRelation: "deeds"
            referencedColumns: ["id"]
          },
        ]
      }
      deeds: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          deed_number: string | null
          id: string
          issuer: string | null
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          deed_number?: string | null
          id?: string
          issuer?: string | null
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          deed_number?: string | null
          id?: string
          issuer?: string | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deeds_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "deed_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deeds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deeds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_evidence: {
        Row: {
          created_at: string
          created_by: string
          document_id: string | null
          id: string
          kind: string
          note: string | null
          request_id: string
          site_visit_id: string | null
          stage_progress_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id?: string | null
          id?: string
          kind: string
          note?: string | null
          request_id: string
          site_visit_id?: string | null
          stage_progress_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          request_id?: string
          site_visit_id?: string | null
          stage_progress_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_evidence_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_evidence_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "disbursement_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_evidence_site_visit_id_fkey"
            columns: ["site_visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_evidence_stage_progress_id_fkey"
            columns: ["stage_progress_id"]
            isOneToOne: false
            referencedRelation: "stage_progress"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_request_amounts: {
        Row: {
          created_at: string
          currency: string
          gross_amount: number
          net_amount: number | null
          request_id: string
          retention_amount: number
        }
        Insert: {
          created_at?: string
          currency?: string
          gross_amount: number
          net_amount?: number | null
          request_id: string
          retention_amount?: number
        }
        Update: {
          created_at?: string
          currency?: string
          gross_amount?: number
          net_amount?: number | null
          request_id?: string
          retention_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_request_amounts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "disbursement_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      disbursement_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          contract_id: string
          created_at: string
          executed_at: string | null
          executed_by: string | null
          id: string
          milestone_id: string
          note: string | null
          project_id: string
          reason_text: string | null
          rejected_at: string | null
          rejected_by: string | null
          requested_at: string
          requested_by: string
          resubmitted_from: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          stage_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          contract_id: string
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          milestone_id: string
          note?: string | null
          project_id: string
          reason_text?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string
          requested_by: string
          resubmitted_from?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          contract_id?: string
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          milestone_id?: string
          note?: string | null
          project_id?: string
          reason_text?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string
          requested_by?: string
          resubmitted_from?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disbursement_requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_requests_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_requests_resubmitted_from_fkey"
            columns: ["resubmitted_from"]
            isOneToOne: false
            referencedRelation: "disbursement_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disbursement_requests_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audience: {
        Row: {
          audience_entity_id: string | null
          audience_user_id: string | null
          created_at: string
          document_id: string
          id: string
        }
        Insert: {
          audience_entity_id?: string | null
          audience_user_id?: string | null
          created_at?: string
          document_id: string
          id?: string
        }
        Update: {
          audience_entity_id?: string | null
          audience_user_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_audience_audience_entity_id_fkey"
            columns: ["audience_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_audience_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_categories: {
        Row: {
          allowed_mime: string[]
          code: string
          created_at: string
          group_code: string
          is_active: boolean
          max_size_mb: number
          name_ar: string
          name_en: string
          order_index: number
          updated_at: string
        }
        Insert: {
          allowed_mime?: string[]
          code: string
          created_at?: string
          group_code: string
          is_active?: boolean
          max_size_mb?: number
          name_ar: string
          name_en: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          allowed_mime?: string[]
          code?: string
          created_at?: string
          group_code?: string
          is_active?: boolean
          max_size_mb?: number
          name_ar?: string
          name_en?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      document_links: {
        Row: {
          context_id: string
          context_type: string
          created_at: string
          document_id: string
          id: string
          linked_by: string
          relation: string
        }
        Insert: {
          context_id: string
          context_type: string
          created_at?: string
          document_id: string
          id?: string
          linked_by: string
          relation?: string
        }
        Update: {
          context_id?: string
          context_type?: string
          created_at?: string
          document_id?: string
          id?: string
          linked_by?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          checksum_sha256: string
          created_at: string
          created_by: string
          document_id: string
          file_ext: string
          id: string
          mime_type: string
          original_name_hint: string | null
          scan_note: string | null
          scan_status: string
          size_bytes: number
          source: string
          storage_bucket: string
          storage_path: string
          supersede_reason: string | null
          version_no: number
        }
        Insert: {
          checksum_sha256: string
          created_at?: string
          created_by: string
          document_id: string
          file_ext: string
          id?: string
          mime_type: string
          original_name_hint?: string | null
          scan_note?: string | null
          scan_status?: string
          size_bytes: number
          source?: string
          storage_bucket?: string
          storage_path: string
          supersede_reason?: string | null
          version_no: number
        }
        Update: {
          checksum_sha256?: string
          created_at?: string
          created_by?: string
          document_id?: string
          file_ext?: string
          id?: string
          mime_type?: string
          original_name_hint?: string | null
          scan_note?: string | null
          scan_status?: string
          size_bytes?: number
          source?: string
          storage_bucket?: string
          storage_path?: string
          supersede_reason?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          category_code: string
          created_at: string
          created_by: string
          current_version_id: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          is_deleted: boolean
          owner_entity_id: string
          status: string
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["doc_visibility"]
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category_code: string
          created_at?: string
          created_by: string
          current_version_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          owner_entity_id: string
          status?: string
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["doc_visibility"]
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          category_code?: string
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          is_deleted?: boolean
          owner_entity_id?: string
          status?: string
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["doc_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "documents_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_entity_id_fkey"
            columns: ["owner_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      duration_timers: {
        Row: {
          contract_id: string | null
          created_at: string
          due_at: string | null
          entity_id: string | null
          id: string
          last_overdue_bucket: string | null
          last_pre_due_bucket: string | null
          paused_at: string | null
          project_id: string | null
          started_at: string
          state: string
          stopped_at: string | null
          subject_id: string
          subject_kind: string
          total_paused_seconds: number
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          due_at?: string | null
          entity_id?: string | null
          id?: string
          last_overdue_bucket?: string | null
          last_pre_due_bucket?: string | null
          paused_at?: string | null
          project_id?: string | null
          started_at?: string
          state?: string
          stopped_at?: string | null
          subject_id: string
          subject_kind: string
          total_paused_seconds?: number
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          due_at?: string | null
          entity_id?: string | null
          id?: string
          last_overdue_bucket?: string | null
          last_pre_due_bucket?: string | null
          paused_at?: string | null
          project_id?: string | null
          started_at?: string
          state?: string
          stopped_at?: string | null
          subject_id?: string
          subject_kind?: string
          total_paused_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "duration_timers_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duration_timers_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duration_timers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          status?: string
          type?: string
        }
        Relationships: []
      }
      entity_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          entity_id: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          entity_id: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          entity_id?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_invitations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_licenses: {
        Row: {
          authority: string
          created_at: string
          created_by: string
          discipline: string | null
          entity_id: string
          expires_on: string | null
          id: string
          issued_on: string | null
          license_number: string
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          authority: string
          created_at?: string
          created_by: string
          discipline?: string | null
          entity_id: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          license_number: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          authority?: string
          created_at?: string
          created_by?: string
          discipline?: string | null
          entity_id?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          license_number?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_licenses_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_memberships: {
        Row: {
          created_at: string
          entity_id: string
          expires_at: string | null
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_memberships_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_profiles: {
        Row: {
          address_text: string | null
          contact_email: string | null
          contact_phone: string | null
          cr_number: string | null
          created_at: string
          entity_id: string
          legal_name_ar: string | null
          legal_name_en: string | null
          logo_path: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          address_text?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cr_number?: string | null
          created_at?: string
          entity_id: string
          legal_name_ar?: string | null
          legal_name_en?: string | null
          logo_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          address_text?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cr_number?: string | null
          created_at?: string
          entity_id?: string
          legal_name_ar?: string | null
          legal_name_en?: string | null
          logo_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_profiles_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_seals: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          id: string
          is_active: boolean
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id: string
          id?: string
          is_active?: boolean
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          id?: string
          is_active?: boolean
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_seals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_events: {
        Row: {
          id: string
          notification_id: string | null
          policy_id: string
          project_id: string | null
          raised_at: string
          reason: string | null
          resolved_recipient_user_id: string | null
          step_no: number
          timer_id: string
        }
        Insert: {
          id?: string
          notification_id?: string | null
          policy_id: string
          project_id?: string | null
          raised_at?: string
          reason?: string | null
          resolved_recipient_user_id?: string | null
          step_no: number
          timer_id: string
        }
        Update: {
          id?: string
          notification_id?: string | null
          policy_id?: string
          project_id?: string | null
          raised_at?: string
          reason?: string | null
          resolved_recipient_user_id?: string | null
          step_no?: number
          timer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_events_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "escalation_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_events_timer_id_fkey"
            columns: ["timer_id"]
            isOneToOne: false
            referencedRelation: "duration_timers"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_policies: {
        Row: {
          contract_id: string | null
          created_at: string
          created_by: string
          entity_id: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          project_id: string | null
          subject_kind: string
          trigger_after_hours: number
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          created_by: string
          entity_id: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          project_id?: string | null
          subject_kind: string
          trigger_after_hours?: number
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          created_by?: string
          entity_id?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          project_id?: string | null
          subject_kind?: string
          trigger_after_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_policies_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_policies_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_policies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_steps: {
        Row: {
          created_at: string
          delay_hours: number
          id: string
          policy_id: string
          step_no: number
          target_kind: string
          target_role: string | null
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          id?: string
          policy_id: string
          step_no: number
          target_kind: string
          target_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          delay_hours?: number
          id?: string
          policy_id?: string
          step_no?: number
          target_kind?: string
          target_role?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_steps_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "escalation_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_document_amounts: {
        Row: {
          created_at: string
          currency: string
          retention_amount: number
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          version_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          retention_amount?: number
          subtotal: number
          tax_amount?: number
          tax_rate?: number
          total: number
          version_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          retention_amount?: number
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_amounts_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "financial_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_document_versions: {
        Row: {
          change_reason: string | null
          created_at: string
          created_by: string
          document_id: string
          id: string
          payload: Json
          version_no: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          created_by: string
          document_id: string
          id?: string
          payload?: Json
          version_no: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          payload?: Json
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_documents: {
        Row: {
          cancel_reason: string | null
          contract_id: string | null
          counterparty_party_id: string | null
          created_at: string
          created_by: string
          current_version_id: string | null
          direction: string
          disbursement_request_id: string | null
          doc_number: string | null
          doc_type: string
          id: string
          issue_date: string
          issuer_party_id: string | null
          milestone_id: string | null
          project_id: string
          references_document_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          contract_id?: string | null
          counterparty_party_id?: string | null
          created_at?: string
          created_by: string
          current_version_id?: string | null
          direction: string
          disbursement_request_id?: string | null
          doc_number?: string | null
          doc_type: string
          id?: string
          issue_date?: string
          issuer_party_id?: string | null
          milestone_id?: string | null
          project_id: string
          references_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          contract_id?: string | null
          counterparty_party_id?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          direction?: string
          disbursement_request_id?: string | null
          doc_number?: string | null
          doc_type?: string
          id?: string
          issue_date?: string
          issuer_party_id?: string | null
          milestone_id?: string | null
          project_id?: string
          references_document_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_counterparty_party_id_fkey"
            columns: ["counterparty_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "financial_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_disbursement_request_id_fkey"
            columns: ["disbursement_request_id"]
            isOneToOne: false
            referencedRelation: "disbursement_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_issuer_party_id_fkey"
            columns: ["issuer_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_references_document_id_fkey"
            columns: ["references_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_executions: {
        Row: {
          executed_at: string
          executed_by: string
          external_reference: string | null
          id: string
          idempotency_key: string
          method: string
          milestone_id: string
          note: string | null
          project_id: string
          request_id: string
        }
        Insert: {
          executed_at?: string
          executed_by: string
          external_reference?: string | null
          id?: string
          idempotency_key: string
          method?: string
          milestone_id: string
          note?: string | null
          project_id: string
          request_id: string
        }
        Update: {
          executed_at?: string
          executed_by?: string
          external_reference?: string | null
          id?: string
          idempotency_key?: string
          method?: string
          milestone_id?: string
          note?: string | null
          project_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_executions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_executions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_executions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "disbursement_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      land_boundaries: {
        Row: {
          created_at: string
          description: string | null
          id: string
          length_m: number | null
          neighbor_text: string | null
          order_index: number
          property_id: string
          side: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          length_m?: number | null
          neighbor_text?: string | null
          order_index?: number
          property_id: string
          side: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          length_m?: number | null
          neighbor_text?: string | null
          order_index?: number
          property_id?: string
          side?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "land_boundaries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_boundaries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          code: string
          created_at: string
          name_ar: string
          name_en: string
          normal_side: string
        }
        Insert: {
          code: string
          created_at?: string
          name_ar: string
          name_en: string
          normal_side: string
        }
        Update: {
          code?: string
          created_at?: string
          name_ar?: string
          name_en?: string
          normal_side?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          is_reversal: boolean
          memo: string | null
          project_id: string
          reverses_entry_id: string | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          is_reversal?: boolean
          memo?: string | null
          project_id: string
          reverses_entry_id?: string | null
          source_id?: string | null
          source_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          is_reversal?: boolean
          memo?: string | null
          project_id?: string
          reverses_entry_id?: string | null
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_lines: {
        Row: {
          account_code: string
          amount: number
          created_at: string
          currency: string
          entry_id: string
          id: string
          line_no: number
          memo: string | null
          party_entity_id: string | null
          side: string
        }
        Insert: {
          account_code: string
          amount: number
          created_at?: string
          currency?: string
          entry_id: string
          id?: string
          line_no: number
          memo?: string | null
          party_entity_id?: string | null
          side: string
        }
        Update: {
          account_code?: string
          amount?: number
          created_at?: string
          currency?: string
          entry_id?: string
          id?: string
          line_no?: number
          memo?: string | null
          party_entity_id?: string | null
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_lines_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ledger_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_lines_party_entity_id_fkey"
            columns: ["party_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      license_versions: {
        Row: {
          created_at: string
          created_by: string
          expires_on: string | null
          extracted_payload: Json | null
          file_hash: string | null
          file_path: string | null
          id: string
          issued_on: string | null
          license_id: string
          scope_text: string | null
          source: string
          version_no: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_on?: string | null
          extracted_payload?: Json | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          license_id: string
          scope_text?: string | null
          source?: string
          version_no: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_on?: string | null
          extracted_payload?: Json | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          issued_on?: string | null
          license_id?: string
          scope_text?: string | null
          source?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "license_versions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "building_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempted_at: string
          channel: string
          deferred_reason: string | null
          id: string
          notification_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          channel: string
          deferred_reason?: string | null
          id?: string
          notification_id: string
          sent_at?: string | null
          status: string
        }
        Update: {
          attempted_at?: string
          channel?: string
          deferred_reason?: string | null
          id?: string
          notification_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_digest_items: {
        Row: {
          created_at: string
          digest_id: string
          id: string
          notification_id: string
        }
        Insert: {
          created_at?: string
          digest_id: string
          id?: string
          notification_id: string
        }
        Update: {
          created_at?: string
          digest_id?: string
          id?: string
          notification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_digest_items_digest_id_fkey"
            columns: ["digest_id"]
            isOneToOne: false
            referencedRelation: "notification_digests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_digest_items_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_digests: {
        Row: {
          built_at: string
          digest_mode: string
          id: string
          item_count: number
          period_end: string
          period_start: string
          sent_at: string | null
          user_id: string
        }
        Insert: {
          built_at?: string
          digest_mode: string
          id?: string
          item_count?: number
          period_end: string
          period_start: string
          sent_at?: string | null
          user_id: string
        }
        Update: {
          built_at?: string
          digest_mode?: string
          id?: string
          item_count?: number
          period_end?: string
          period_start?: string
          sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          digest_mode: string
          in_app: boolean
          type_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_mode?: string
          in_app?: boolean
          type_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_mode?: string
          in_app?: boolean
          type_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_type_code_fkey"
            columns: ["type_code"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
        ]
      }
      notification_types: {
        Row: {
          body_key: string
          category: string
          code: string
          created_at: string
          default_channel: string
          is_mandatory: boolean
          is_security: boolean
          subject_key: string
          target_kind: string
        }
        Insert: {
          body_key: string
          category: string
          code: string
          created_at?: string
          default_channel?: string
          is_mandatory?: boolean
          is_security?: boolean
          subject_key: string
          target_kind: string
        }
        Update: {
          body_key?: string
          category?: string
          code?: string
          created_at?: string
          default_channel?: string
          is_mandatory?: boolean
          is_security?: boolean
          subject_key?: string
          target_kind?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          entity_id: string | null
          escalation_of_id: string | null
          id: string
          payload: Json
          project_id: string | null
          read_at: string | null
          recipient_user_id: string
          severity: string
          target_id: string | null
          target_kind: string
          type_code: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          dismissed_at?: string | null
          entity_id?: string | null
          escalation_of_id?: string | null
          id?: string
          payload?: Json
          project_id?: string | null
          read_at?: string | null
          recipient_user_id: string
          severity?: string
          target_id?: string | null
          target_kind: string
          type_code: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          entity_id?: string | null
          escalation_of_id?: string | null
          id?: string
          payload?: Json
          project_id?: string | null
          read_at?: string | null
          recipient_user_id?: string
          severity?: string
          target_id?: string | null
          target_kind?: string
          type_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_escalation_of_id_fkey"
            columns: ["escalation_of_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_type_code_fkey"
            columns: ["type_code"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["code"]
          },
        ]
      }
      observation_actions: {
        Row: {
          action_text: string
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          due_on: string | null
          id: string
          observation_id: string
          status: string
          updated_at: string
        }
        Insert: {
          action_text: string
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          due_on?: string | null
          id?: string
          observation_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_text?: string
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          due_on?: string | null
          id?: string
          observation_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_actions_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "stage_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_reinspections: {
        Row: {
          action_id: string | null
          created_at: string
          id: string
          inspected_by: string
          note: string | null
          observation_id: string
          result: string
          visit_id: string | null
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          id?: string
          inspected_by: string
          note?: string | null
          observation_id: string
          result: string
          visit_id?: string | null
        }
        Update: {
          action_id?: string | null
          created_at?: string
          id?: string
          inspected_by?: string
          note?: string | null
          observation_id?: string
          result?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "observation_reinspections_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "observation_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_reinspections_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "stage_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_reinspections_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestone_amounts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          milestone_id: string
          percent_of_contract: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          milestone_id: string
          percent_of_contract?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          milestone_id?: string
          percent_of_contract?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestone_amounts_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: true
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          basis: string
          cancel_reason: string | null
          contract_id: string
          contract_version_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          project_id: string
          seq: number
          stage_id: string | null
          status: string
          supersedes_id: string | null
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          basis?: string
          cancel_reason?: string | null
          contract_id: string
          contract_version_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          project_id: string
          seq: number
          stage_id?: string | null
          status?: string
          supersedes_id?: string | null
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          basis?: string
          cancel_reason?: string | null
          contract_id?: string
          contract_version_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          project_id?: string
          seq?: number
          stage_id?: string | null
          status?: string
          supersedes_id?: string | null
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_contract_version_id_fkey"
            columns: ["contract_version_id"]
            isOneToOne: false
            referencedRelation: "contract_versions_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          object_id: string | null
          object_type: string
          old_value: Json | null
          target_entity_id: string | null
          target_project_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          object_id?: string | null
          object_type: string
          old_value?: Json | null
          target_entity_id?: string | null
          target_project_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          object_id?: string | null
          object_type?: string
          old_value?: Json | null
          target_entity_id?: string | null
          target_project_id?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      permission_grants: {
        Row: {
          action: Database["public"]["Enums"]["app_action"]
          created_at: string
          effect: string
          expires_at: string | null
          granted_by: string
          id: string
          module: Database["public"]["Enums"]["app_module"]
          revoked_at: string | null
          scope_entity_id: string | null
          scope_project_id: string | null
          scope_type: string
          subject_entity_id: string | null
          subject_user_id: string | null
          updated_at: string
        }
        Insert: {
          action: Database["public"]["Enums"]["app_action"]
          created_at?: string
          effect?: string
          expires_at?: string | null
          granted_by: string
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          revoked_at?: string | null
          scope_entity_id?: string | null
          scope_project_id?: string | null
          scope_type: string
          subject_entity_id?: string | null
          subject_user_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["app_action"]
          created_at?: string
          effect?: string
          expires_at?: string | null
          granted_by?: string
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          revoked_at?: string | null
          scope_entity_id?: string | null
          scope_project_id?: string | null
          scope_type?: string
          subject_entity_id?: string | null
          subject_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_grants_scope_entity_id_fkey"
            columns: ["scope_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_grants_scope_project_id_fkey"
            columns: ["scope_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_grants_subject_entity_id_fkey"
            columns: ["subject_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      portfolio_assets: {
        Row: {
          created_at: string
          document_id: string
          entry_id: string
          id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          entry_id: string
          id?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_assets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_assets_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "portfolio_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_entries: {
        Row: {
          city: string | null
          completed_on: string | null
          created_at: string
          district: string | null
          entity_id: string
          id: string
          is_public: boolean
          project_id: string
          project_type_code: string | null
          published_at: string
          published_by: string
          summary_ar: string | null
          summary_en: string | null
          title_ar: string
          title_en: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          completed_on?: string | null
          created_at?: string
          district?: string | null
          entity_id: string
          id?: string
          is_public?: boolean
          project_id: string
          project_type_code?: string | null
          published_at?: string
          published_by: string
          summary_ar?: string | null
          summary_en?: string | null
          title_ar: string
          title_en: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          completed_on?: string | null
          created_at?: string
          district?: string | null
          entity_id?: string
          id?: string
          is_public?: boolean
          project_id?: string
          project_type_code?: string | null
          published_at?: string
          published_by?: string
          summary_ar?: string | null
          summary_en?: string | null
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_entries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_acceptances: {
        Row: {
          certificate_document_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          inspected_at: string | null
          inspected_by: string | null
          phase: string
          project_id: string
          requested_at: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          certificate_document_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          phase: string
          project_id: string
          requested_at?: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          certificate_document_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          phase?: string
          project_id?: string
          requested_at?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_acceptances_certificate_document_id_fkey"
            columns: ["certificate_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_acceptances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          ends_on: string | null
          entity_id: string | null
          id: string
          job_title_ar: string
          job_title_en: string
          project_id: string
          stage_id: string | null
          starts_on: string
          status: string
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["visibility_level"]
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          ends_on?: string | null
          entity_id?: string | null
          id?: string
          job_title_ar: string
          job_title_en: string
          project_id: string
          stage_id?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          ends_on?: string | null
          entity_id?: string | null
          id?: string
          job_title_ar?: string
          job_title_en?: string
          project_id?: string
          stage_id?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["visibility_level"]
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_closure_items: {
        Row: {
          code: string
          created_at: string
          document_id: string | null
          id: string
          is_required: boolean
          name_ar: string
          name_en: string
          phase: string
          project_id: string
          satisfied_at: string | null
          satisfied_by: string | null
          status: string
          template_item_id: string | null
          updated_at: string
          waiver_reason: string | null
        }
        Insert: {
          code: string
          created_at?: string
          document_id?: string | null
          id?: string
          is_required?: boolean
          name_ar: string
          name_en: string
          phase: string
          project_id: string
          satisfied_at?: string | null
          satisfied_by?: string | null
          status?: string
          template_item_id?: string | null
          updated_at?: string
          waiver_reason?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          document_id?: string | null
          id?: string
          is_required?: boolean
          name_ar?: string
          name_en?: string
          phase?: string
          project_id?: string
          satisfied_at?: string | null
          satisfied_by?: string | null
          status?: string
          template_item_id?: string | null
          updated_at?: string
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_closure_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_closure_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_closure_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "closure_checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_parties: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ends_on: string | null
          id: string
          invited_by: string
          party_entity_id: string
          party_role: Database["public"]["Enums"]["project_party_role"]
          project_id: string
          responded_at: string | null
          responded_by: string | null
          scope_text_ar: string | null
          scope_text_en: string | null
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ends_on?: string | null
          id?: string
          invited_by: string
          party_entity_id: string
          party_role: Database["public"]["Enums"]["project_party_role"]
          project_id: string
          responded_at?: string | null
          responded_by?: string | null
          scope_text_ar?: string | null
          scope_text_en?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ends_on?: string | null
          id?: string
          invited_by?: string
          party_entity_id?: string
          party_role?: Database["public"]["Enums"]["project_party_role"]
          project_id?: string
          responded_at?: string | null
          responded_by?: string | null
          scope_text_ar?: string | null
          scope_text_en?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_parties_party_entity_id_fkey"
            columns: ["party_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_parties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_party_permissions: {
        Row: {
          created_at: string
          grant_id: string
          id: string
          party_id: string
        }
        Insert: {
          created_at?: string
          grant_id: string
          id?: string
          party_id: string
        }
        Update: {
          created_at?: string
          grant_id?: string
          id?: string
          party_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_party_permissions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "permission_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_party_permissions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      project_party_stages: {
        Row: {
          created_at: string
          id: string
          party_id: string
          stage_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          party_id: string
          stage_id: string
        }
        Update: {
          created_at?: string
          id?: string
          party_id?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_party_stages_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_party_stages_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_reopen_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          project_id: string
          reason: string
          requested_at: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          project_id: string
          reason: string
          requested_at?: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          project_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_reopen_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          approved_at: string | null
          approved_by: string | null
          completion_note: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_required: boolean
          name_ar: string
          name_en: string
          order_index: number
          parent_stage_id: string | null
          planned_end: string | null
          planned_start: string | null
          project_id: string
          source: string
          stage_template_id: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          approved_at?: string | null
          approved_by?: string | null
          completion_note?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          name_ar: string
          name_en: string
          order_index: number
          parent_stage_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          project_id: string
          source?: string
          stage_template_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          approved_at?: string | null
          approved_by?: string | null
          completion_note?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          name_ar?: string
          name_en?: string
          order_index?: number
          parent_stage_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          project_id?: string
          source?: string
          stage_template_id?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_parent_stage_id_fkey"
            columns: ["parent_stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_stage_template_id_fkey"
            columns: ["stage_template_id"]
            isOneToOne: false
            referencedRelation: "stage_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          feature_flag: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string
          requires_license: boolean
          updated_at: string
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          feature_flag?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en: string
          requires_license?: boolean
          updated_at?: string
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          feature_flag?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string
          requires_license?: boolean
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          city: string | null
          closed_at: string | null
          closed_by: string | null
          closure_note: string | null
          code: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          district: string | null
          entity_id: string | null
          expected_end_date: string | null
          id: string
          land_area: number | null
          name: string
          notes: string | null
          owner_id: string
          project_template_id: string
          reopened_count: number
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          code?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          district?: string | null
          entity_id?: string | null
          expected_end_date?: string | null
          id?: string
          land_area?: number | null
          name: string
          notes?: string | null
          owner_id: string
          project_template_id: string
          reopened_count?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_note?: string | null
          code?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          district?: string | null
          entity_id?: string | null
          expected_end_date?: string | null
          id?: string
          land_area?: number | null
          name?: string
          notes?: string | null
          owner_id?: string
          project_template_id?: string
          reopened_count?: number
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          approx_lat: number | null
          approx_lng: number | null
          city: string | null
          code: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          district: string | null
          entity_id: string | null
          id: string
          kind: string
          land_area: number | null
          name: string
          notes: string | null
          owner_id: string
          parcel_no: string | null
          plan_no: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approx_lat?: number | null
          approx_lng?: number | null
          city?: string | null
          code?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          district?: string | null
          entity_id?: string | null
          id?: string
          kind: string
          land_area?: number | null
          name: string
          notes?: string | null
          owner_id: string
          parcel_no?: string | null
          plan_no?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approx_lat?: number | null
          approx_lng?: number | null
          city?: string | null
          code?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          district?: string | null
          entity_id?: string | null
          id?: string
          kind?: string
          land_area?: number | null
          name?: string
          notes?: string | null
          owner_id?: string
          parcel_no?: string | null
          plan_no?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      property_completion_rules: {
        Row: {
          created_at: string
          kind: string
          requirement_code: string
          weight: number
        }
        Insert: {
          created_at?: string
          kind: string
          requirement_code: string
          weight: number
        }
        Update: {
          created_at?: string
          kind?: string
          requirement_code?: string
          weight?: number
        }
        Relationships: []
      }
      property_exact_locations: {
        Row: {
          created_at: string
          exact_address: string | null
          exact_lat: number | null
          exact_lng: number | null
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exact_address?: string | null
          exact_lat?: number | null
          exact_lng?: number | null
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exact_address?: string | null
          exact_lat?: number | null
          exact_lng?: number | null
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_exact_locations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_exact_locations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owners: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          national_id_masked: string | null
          owner_entity_id: string | null
          owner_name_text: string | null
          owner_user_id: string | null
          property_id: string
          share_percent: number
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          national_id_masked?: string | null
          owner_entity_id?: string | null
          owner_name_text?: string | null
          owner_user_id?: string | null
          property_id: string
          share_percent: number
          starts_on?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          national_id_masked?: string | null
          owner_entity_id?: string | null
          owner_name_text?: string | null
          owner_user_id?: string | null
          property_id?: string
          share_percent?: number
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_owner_entity_id_fkey"
            columns: ["owner_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owners_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      property_projects: {
        Row: {
          created_at: string
          id: string
          linked_by: string
          project_id: string
          property_id: string
          relation: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_by: string
          project_id: string
          property_id: string
          relation?: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_by?: string
          project_id?: string
          property_id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_projects_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_projects_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      property_services: {
        Row: {
          account_no: string | null
          activated_at: string | null
          created_at: string
          id: string
          installed_at: string | null
          meter_no: string | null
          notes: string | null
          property_id: string
          property_unit_id: string | null
          provider_name: string | null
          reference_no: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_code: string | null
          service_type: string
          source_request_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          activated_at?: string | null
          created_at?: string
          id?: string
          installed_at?: string | null
          meter_no?: string | null
          notes?: string | null
          property_id: string
          property_unit_id?: string | null
          provider_name?: string | null
          reference_no?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_code?: string | null
          service_type: string
          source_request_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          activated_at?: string | null
          created_at?: string
          id?: string
          installed_at?: string | null
          meter_no?: string | null
          notes?: string | null
          property_id?: string
          property_unit_id?: string | null
          provider_name?: string | null
          reference_no?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_code?: string | null
          service_type?: string
          source_request_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_services_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_services_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_services_property_unit_id_fkey"
            columns: ["property_unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_services_service_code_fkey"
            columns: ["service_code"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "property_services_source_request_id_fkey"
            columns: ["source_request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      property_units: {
        Row: {
          area: number | null
          created_at: string
          floor_no: number | null
          id: string
          notes: string | null
          property_id: string
          rooms: number | null
          status: string
          unit_no: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          area?: number | null
          created_at?: string
          floor_no?: number | null
          id?: string
          notes?: string | null
          property_id: string
          rooms?: number | null
          status?: string
          unit_no: string
          unit_type?: string
          updated_at?: string
        }
        Update: {
          area?: number | null
          created_at?: string
          floor_no?: number | null
          id?: string
          notes?: string | null
          property_id?: string
          rooms?: number | null
          status?: string
          unit_no?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_item_evidence: {
        Row: {
          created_at: string
          document_id: string
          id: string
          kind: string
          note: string | null
          punch_item_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          kind: string
          note?: string | null
          punch_item_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          kind?: string
          note?: string | null
          punch_item_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_item_evidence_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_item_evidence_punch_item_id_fkey"
            columns: ["punch_item_id"]
            isOneToOne: false
            referencedRelation: "punch_items"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_items: {
        Row: {
          acceptance_id: string | null
          assigned_party_id: string | null
          assigned_user_id: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          project_id: string
          raised_at: string
          raised_by: string
          severity: string
          stage_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acceptance_id?: string | null
          assigned_party_id?: string | null
          assigned_user_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          project_id: string
          raised_at?: string
          raised_by: string
          severity?: string
          stage_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acceptance_id?: string | null
          assigned_party_id?: string | null
          assigned_user_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          project_id?: string
          raised_at?: string
          raised_by?: string
          severity?: string
          stage_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "punch_items_acceptance_id_fkey"
            columns: ["acceptance_id"]
            isOneToOne: false
            referencedRelation: "project_acceptances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_items_assigned_party_id_fkey"
            columns: ["assigned_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_items_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      report_assets: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          mime_type: string
          report_id: string
          size_bytes: number
          storage_bucket: string
          storage_path: string
          uploaded_by: string
          version_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          mime_type: string
          report_id: string
          size_bytes: number
          storage_bucket?: string
          storage_path: string
          uploaded_by: string
          version_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          mime_type?: string
          report_id?: string
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_assets_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_assets_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "report_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          report_id: string
          version_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          report_id: string
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          report_id?: string
          version_id?: string | null
        }
        Relationships: []
      }
      report_number_counters: {
        Row: {
          entity_id: string
          last_no: number
          year: number
        }
        Insert: {
          entity_id: string
          last_no?: number
          year: number
        }
        Update: {
          entity_id?: string
          last_no?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_number_counters_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      report_template_imports: {
        Row: {
          blocks_created: number
          checksum_sha256: string | null
          created_at: string
          created_by: string
          dropped_report: Json
          entity_id: string | null
          error_text: string | null
          file_ext: string
          id: string
          kind: string
          mime_type: string
          owner_scope: string
          size_bytes: number
          status: string
          storage_bucket: string
          storage_path: string
          template_id: string | null
          updated_at: string
          warnings: Json
        }
        Insert: {
          blocks_created?: number
          checksum_sha256?: string | null
          created_at?: string
          created_by: string
          dropped_report?: Json
          entity_id?: string | null
          error_text?: string | null
          file_ext: string
          id?: string
          kind: string
          mime_type: string
          owner_scope: string
          size_bytes: number
          status?: string
          storage_bucket?: string
          storage_path: string
          template_id?: string | null
          updated_at?: string
          warnings?: Json
        }
        Update: {
          blocks_created?: number
          checksum_sha256?: string | null
          created_at?: string
          created_by?: string
          dropped_report?: Json
          entity_id?: string | null
          error_text?: string | null
          file_ext?: string
          id?: string
          kind?: string
          mime_type?: string
          owner_scope?: string
          size_bytes?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          template_id?: string | null
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_template_imports_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_template_imports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          code: string | null
          content: Json
          created_at: string
          created_by: string | null
          direction: string
          entity_id: string | null
          id: string
          language: string
          name_ar: string
          name_en: string
          owner_scope: string
          page_setup: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          direction?: string
          entity_id?: string | null
          id?: string
          language?: string
          name_ar: string
          name_en: string
          owner_scope: string
          page_setup?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          direction?: string
          entity_id?: string | null
          id?: string
          language?: string
          name_ar?: string
          name_en?: string
          owner_scope?: string
          page_setup?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          checksum_sha256: string | null
          content: Json
          created_at: string
          created_by: string
          export_docx_path: string | null
          export_pdf_path: string | null
          exported_at: string | null
          id: string
          last_edited_by: string | null
          page_setup: Json
          report_id: string
          snapshot: Json | null
          stamp_applied: boolean
          status: Database["public"]["Enums"]["report_version_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          verify_token: string
          version_no: number
        }
        Insert: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          checksum_sha256?: string | null
          content?: Json
          created_at?: string
          created_by: string
          export_docx_path?: string | null
          export_pdf_path?: string | null
          exported_at?: string | null
          id?: string
          last_edited_by?: string | null
          page_setup?: Json
          report_id: string
          snapshot?: Json | null
          stamp_applied?: boolean
          status?: Database["public"]["Enums"]["report_version_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          verify_token?: string
          version_no: number
        }
        Update: {
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          checksum_sha256?: string | null
          content?: Json
          created_at?: string
          created_by?: string
          export_docx_path?: string | null
          export_pdf_path?: string | null
          exported_at?: string | null
          id?: string
          last_edited_by?: string | null
          page_setup?: Json
          report_id?: string
          snapshot?: Json | null
          stamp_applied?: boolean
          status?: Database["public"]["Enums"]["report_version_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          verify_token?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          direction: string
          entity_id: string
          id: string
          is_certified: boolean
          language: string
          project_id: string
          property_id: string | null
          report_number: string
          stage_id: string | null
          status: Database["public"]["Enums"]["report_status"]
          template_id: string | null
          title: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          direction?: string
          entity_id: string
          id?: string
          is_certified?: boolean
          language?: string
          project_id: string
          property_id?: string | null
          report_number: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          template_id?: string | null
          title: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          direction?: string
          entity_id?: string
          id?: string
          is_certified?: boolean
          language?: string
          project_id?: string
          property_id?: string | null
          report_number?: string
          stage_id?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          template_id?: string | null
          title?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_current_version_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "report_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      request_status_transitions: {
        Row: {
          actor_scope: string
          from_status: string
          to_status: string
        }
        Insert: {
          actor_scope?: string
          from_status: string
          to_status: string
        }
        Update: {
          actor_scope?: string
          from_status?: string
          to_status?: string
        }
        Relationships: []
      }
      request_types: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          module: Database["public"]["Enums"]["app_module"]
          name_ar: string
          name_en: string
          order_index: number
          requires_stage: boolean
          requires_unit: boolean
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          module?: Database["public"]["Enums"]["app_module"]
          name_ar: string
          name_en: string
          order_index?: number
          requires_stage?: boolean
          requires_unit?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          module?: Database["public"]["Enums"]["app_module"]
          name_ar?: string
          name_en?: string
          order_index?: number
          requires_stage?: boolean
          requires_unit?: boolean
        }
        Relationships: []
      }
      requests: {
        Row: {
          assigned_entity_id: string | null
          assigned_user_id: string | null
          closed_at: string | null
          closure_reason: string | null
          contract_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          due_at: string | null
          id: string
          priority: string
          project_id: string
          property_id: string | null
          property_unit_id: string | null
          request_no: string
          request_type_code: string
          requested_by: string
          stage_id: string | null
          status: string
          subject: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          assigned_entity_id?: string | null
          assigned_user_id?: string | null
          closed_at?: string | null
          closure_reason?: string | null
          contract_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id: string
          property_id?: string | null
          property_unit_id?: string | null
          request_no?: string
          request_type_code: string
          requested_by: string
          stage_id?: string | null
          status?: string
          subject: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          assigned_entity_id?: string | null
          assigned_user_id?: string | null
          closed_at?: string | null
          closure_reason?: string | null
          contract_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          due_at?: string | null
          id?: string
          priority?: string
          project_id?: string
          property_id?: string | null
          property_unit_id?: string | null
          request_no?: string
          request_type_code?: string
          requested_by?: string
          stage_id?: string | null
          status?: string
          subject?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_assigned_entity_id_fkey"
            columns: ["assigned_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_property_unit_id_fkey"
            columns: ["property_unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_request_type_code_fkey"
            columns: ["request_type_code"]
            isOneToOne: false
            referencedRelation: "request_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "requests_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "correspondence_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_event_amounts: {
        Row: {
          amount: number
          created_at: string
          currency: string
          event_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          event_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_event_amounts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "retention_events"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_events: {
        Row: {
          acted_at: string
          acted_by: string
          document_id: string | null
          event_date: string
          event_type: string
          hold_id: string
          id: string
          note: string | null
        }
        Insert: {
          acted_at?: string
          acted_by: string
          document_id?: string | null
          event_date?: string
          event_type: string
          hold_id: string
          id?: string
          note?: string | null
        }
        Update: {
          acted_at?: string
          acted_by?: string
          document_id?: string | null
          event_date?: string
          event_type?: string
          hold_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_events_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "retention_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_hold_amounts: {
        Row: {
          created_at: string
          currency: string
          held_amount: number
          hold_id: string
          released_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          held_amount: number
          hold_id: string
          released_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          held_amount?: number
          hold_id?: string
          released_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_hold_amounts_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: true
            referencedRelation: "retention_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_holds: {
        Row: {
          beneficiary_party_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          expected_release_date: string | null
          hold_start_date: string
          holder_party_id: string | null
          id: string
          kind: string
          milestone_id: string | null
          project_id: string
          release_terms_ar: string | null
          release_terms_en: string | null
          status: string
          updated_at: string
        }
        Insert: {
          beneficiary_party_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          expected_release_date?: string | null
          hold_start_date?: string
          holder_party_id?: string | null
          id?: string
          kind?: string
          milestone_id?: string | null
          project_id: string
          release_terms_ar?: string | null
          release_terms_en?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          beneficiary_party_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          expected_release_date?: string | null
          hold_start_date?: string
          holder_party_id?: string | null
          id?: string
          kind?: string
          milestone_id?: string | null
          project_id?: string
          release_terms_ar?: string | null
          release_terms_en?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_holds_beneficiary_party_id_fkey"
            columns: ["beneficiary_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_holds_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_holds_holder_party_id_fkey"
            columns: ["holder_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_holds_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "payment_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_holds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: Database["public"]["Enums"]["app_action"]
          created_at: string
          module: Database["public"]["Enums"]["app_module"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          action: Database["public"]["Enums"]["app_action"]
          created_at?: string
          module: Database["public"]["Enums"]["app_module"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          action?: Database["public"]["Enums"]["app_action"]
          created_at?: string
          module?: Database["public"]["Enums"]["app_module"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      service_catalog: {
        Row: {
          allows_unit_level: boolean
          category: string
          code: string
          created_at: string
          default_provider_ar: string | null
          default_provider_en: string | null
          is_active: boolean
          is_metered: boolean
          name_ar: string
          name_en: string
          order_index: number
          requires_unit: boolean
          updated_at: string
        }
        Insert: {
          allows_unit_level?: boolean
          category: string
          code: string
          created_at?: string
          default_provider_ar?: string | null
          default_provider_en?: string | null
          is_active?: boolean
          is_metered?: boolean
          name_ar: string
          name_en: string
          order_index?: number
          requires_unit?: boolean
          updated_at?: string
        }
        Update: {
          allows_unit_level?: boolean
          category?: string
          code?: string
          created_at?: string
          default_provider_ar?: string | null
          default_provider_en?: string | null
          is_active?: boolean
          is_metered?: boolean
          name_ar?: string
          name_en?: string
          order_index?: number
          requires_unit?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      service_request_details: {
        Row: {
          account_no: string | null
          activated_at: string | null
          appointment_at: string | null
          created_at: string
          external_ref_no: string | null
          installed_at: string | null
          meter_no: string | null
          paid_at: string | null
          payment_amount: number | null
          payment_ref: string | null
          payment_status: string
          provider_name: string | null
          request_id: string
          requirements_note: string | null
          service_code: string
          updated_at: string
        }
        Insert: {
          account_no?: string | null
          activated_at?: string | null
          appointment_at?: string | null
          created_at?: string
          external_ref_no?: string | null
          installed_at?: string | null
          meter_no?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_ref?: string | null
          payment_status?: string
          provider_name?: string | null
          request_id: string
          requirements_note?: string | null
          service_code: string
          updated_at?: string
        }
        Update: {
          account_no?: string | null
          activated_at?: string | null
          appointment_at?: string | null
          created_at?: string
          external_ref_no?: string | null
          installed_at?: string | null
          meter_no?: string | null
          paid_at?: string | null
          payment_amount?: number | null
          payment_ref?: string | null
          payment_status?: string
          provider_name?: string | null
          request_id?: string
          requirements_note?: string | null
          service_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_details_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_details_service_code_fkey"
            columns: ["service_code"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["code"]
          },
        ]
      }
      site_visit_locations: {
        Row: {
          accuracy_m: number | null
          created_at: string
          lat: number
          lng: number
          updated_at: string
          visit_id: string
        }
        Insert: {
          accuracy_m?: number | null
          created_at?: string
          lat: number
          lng: number
          updated_at?: string
          visit_id: string
        }
        Update: {
          accuracy_m?: number | null
          created_at?: string
          lat?: number
          lng?: number
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_locations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          created_at: string
          id: string
          location_consent: boolean
          location_reason: string | null
          project_id: string
          stage_id: string | null
          status: string
          summary: string | null
          updated_at: string
          visit_end: string | null
          visit_start: string
          visited_by: string
          weather_note: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_consent?: boolean
          location_reason?: string | null
          project_id: string
          stage_id?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          visit_end?: string | null
          visit_start?: string
          visited_by: string
          weather_note?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_consent?: boolean
          location_reason?: string | null
          project_id?: string
          stage_id?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
          visit_end?: string | null
          visit_start?: string
          visited_by?: string
          weather_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_attachments: {
        Row: {
          created_at: string
          file_hash: string | null
          file_path: string
          id: string
          kind: string
          mime_type: string | null
          observation_id: string | null
          project_id: string
          stage_id: string | null
          uploaded_by: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          file_hash?: string | null
          file_path: string
          id?: string
          kind?: string
          mime_type?: string | null
          observation_id?: string | null
          project_id: string
          stage_id?: string | null
          uploaded_by: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          file_hash?: string | null
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string | null
          observation_id?: string | null
          project_id?: string
          stage_id?: string | null
          uploaded_by?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_attachments_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "stage_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_attachments_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_attachments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_completion_criteria: {
        Row: {
          code: string
          created_at: string
          created_by: string
          evidence_type: string
          id: string
          is_required: boolean
          label_ar: string
          label_en: string
          stage_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          evidence_type?: string
          id?: string
          is_required?: boolean
          label_ar: string
          label_en: string
          stage_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          evidence_type?: string
          id?: string
          is_required?: boolean
          label_ar?: string
          label_en?: string
          stage_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "stage_completion_criteria_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_criteria_results: {
        Row: {
          created_at: string
          criterion_id: string
          evidence_attachment_id: string | null
          evidence_visit_id: string | null
          id: string
          note: string | null
          recorded_by: string
          satisfied: boolean
          stage_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criterion_id: string
          evidence_attachment_id?: string | null
          evidence_visit_id?: string | null
          id?: string
          note?: string | null
          recorded_by: string
          satisfied?: boolean
          stage_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criterion_id?: string
          evidence_attachment_id?: string | null
          evidence_visit_id?: string | null
          id?: string
          note?: string | null
          recorded_by?: string
          satisfied?: boolean
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_criteria_results_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: true
            referencedRelation: "stage_completion_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_criteria_results_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_dependencies: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          predecessor_stage_id: string
          project_id: string
          successor_stage_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          predecessor_stage_id: string
          project_id: string
          successor_stage_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          predecessor_stage_id?: string
          project_id?: string
          successor_stage_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_dependencies_predecessor_stage_id_fkey"
            columns: ["predecessor_stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_dependencies_successor_stage_id_fkey"
            columns: ["successor_stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_observations: {
        Row: {
          body: string | null
          closed_at: string | null
          created_at: string
          due_on: string | null
          id: string
          kind: string
          project_id: string
          raised_by: string
          severity: string
          stage_id: string
          status: string
          title: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          body?: string | null
          closed_at?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          kind: string
          project_id: string
          raised_by: string
          severity?: string
          stage_id: string
          status?: string
          title: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          body?: string | null
          closed_at?: string | null
          created_at?: string
          due_on?: string | null
          id?: string
          kind?: string
          project_id?: string
          raised_by?: string
          severity?: string
          stage_id?: string
          status?: string
          title?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_observations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_observations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_observations_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_progress: {
        Row: {
          id: string
          note: string | null
          percent: number
          reported_at: string
          reported_by: string
          stage_id: string
        }
        Insert: {
          id?: string
          note?: string | null
          percent: number
          reported_at?: string
          reported_by: string
          stage_id: string
        }
        Update: {
          id?: string
          note?: string | null
          percent?: number
          reported_at?: string
          reported_by?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_progress_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_roles: {
        Row: {
          assigned_by: string
          created_at: string
          ends_on: string | null
          entity_id: string | null
          id: string
          role: string
          stage_id: string
          starts_on: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_by: string
          created_at?: string
          ends_on?: string | null
          entity_id?: string | null
          id?: string
          role: string
          stage_id: string
          starts_on?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_by?: string
          created_at?: string
          ends_on?: string | null
          entity_id?: string | null
          id?: string
          role?: string
          stage_id?: string
          starts_on?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stage_roles_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_roles_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_templates: {
        Row: {
          code: string
          created_at: string
          default_duration_days: number | null
          deleted_at: string | null
          description_ar: string | null
          id: string
          is_required: boolean
          kind: string
          name_ar: string
          name_en: string
          order_index: number
          project_template_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_duration_days?: number | null
          deleted_at?: string | null
          description_ar?: string | null
          id?: string
          is_required?: boolean
          kind?: string
          name_ar: string
          name_en: string
          order_index: number
          project_template_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_duration_days?: number | null
          deleted_at?: string | null
          description_ar?: string | null
          id?: string
          is_required?: boolean
          kind?: string
          name_ar?: string
          name_en?: string
          order_index?: number
          project_template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      warranties: {
        Row: {
          created_at: string
          created_by: string
          document_id: string | null
          ends_on: string
          entity_id: string
          id: string
          project_id: string
          provider_kind: string
          provider_name: string | null
          provider_party_id: string | null
          scope_kind: string
          starts_on: string
          status: string
          system_code: string | null
          title: string
          updated_at: string
          warranty_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id?: string | null
          ends_on: string
          entity_id: string
          id?: string
          project_id: string
          provider_kind?: string
          provider_name?: string | null
          provider_party_id?: string | null
          scope_kind?: string
          starts_on: string
          status?: string
          system_code?: string | null
          title: string
          updated_at?: string
          warranty_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string | null
          ends_on?: string
          entity_id?: string
          id?: string
          project_id?: string
          provider_kind?: string
          provider_name?: string | null
          provider_party_id?: string | null
          scope_kind?: string
          starts_on?: string
          status?: string
          system_code?: string | null
          title?: string
          updated_at?: string
          warranty_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranties_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranties_provider_party_id_fkey"
            columns: ["provider_party_id"]
            isOneToOne: false
            referencedRelation: "project_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_claims: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          description: string
          id: string
          raised_by: string
          status: string
          updated_at: string
          warranty_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description: string
          id?: string
          raised_by: string
          status?: string
          updated_at?: string
          warranty_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string
          id?: string
          raised_by?: string
          status?: string
          updated_at?: string
          warranty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_warranty_id_fkey"
            columns: ["warranty_id"]
            isOneToOne: false
            referencedRelation: "warranties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contract_versions_public: {
        Row: {
          amount: number | null
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          can_view_amounts: boolean | null
          change_reason: string | null
          contract_id: string | null
          created_at: string | null
          ends_on: string | null
          file_path: string | null
          id: string | null
          payment_terms: string | null
          source: string | null
          starts_on: string | null
          terms_text: string | null
          version_no: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments_public: {
        Row: {
          display_name: string | null
          ends_on: string | null
          entity_id: string | null
          id: string | null
          is_identified: boolean | null
          job_title_ar: string | null
          job_title_en: string | null
          project_id: string | null
          stage_id: string | null
          starts_on: string | null
          status: string | null
          user_id: string | null
          visibility: Database["public"]["Enums"]["visibility_level"] | null
        }
        Insert: {
          display_name?: never
          ends_on?: string | null
          entity_id?: string | null
          id?: string | null
          is_identified?: never
          job_title_ar?: string | null
          job_title_en?: string | null
          project_id?: string | null
          stage_id?: string | null
          starts_on?: string | null
          status?: string | null
          user_id?: never
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Update: {
          display_name?: never
          ends_on?: string | null
          entity_id?: string | null
          id?: string | null
          is_identified?: never
          job_title_ar?: string | null
          job_title_en?: string | null
          project_id?: string | null
          stage_id?: string | null
          starts_on?: string | null
          status?: string | null
          user_id?: never
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      properties_public: {
        Row: {
          approx_lat: number | null
          approx_lng: number | null
          can_view_exact: boolean | null
          city: string | null
          code: string | null
          completion_percent: number | null
          created_at: string | null
          district: string | null
          entity_id: string | null
          exact_address: string | null
          exact_lat: number | null
          exact_lng: number | null
          id: string | null
          kind: string | null
          land_area: number | null
          name: string | null
          notes: string | null
          owner_id: string | null
          parcel_no: string | null
          plan_no: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_entity_invitation: { Args: { _token: string }; Returns: string }
      activate_report_template: {
        Args: { _template_id: string }
        Returns: string
      }
      add_document_version: {
        Args: {
          _checksum_sha256: string
          _document_id: string
          _file_ext: string
          _mime_type: string
          _size_bytes: number
          _source?: string
          _supersede_reason?: string
        }
        Returns: {
          storage_bucket: string
          storage_path: string
          version_id: string
          version_no: number
        }[]
      }
      add_punch_evidence: {
        Args: {
          _document_id: string
          _item_id: string
          _kind: string
          _note?: string
        }
        Returns: string
      }
      advance_service_request: {
        Args: { _note?: string; _request_id: string; _to_status: string }
        Returns: string
      }
      am_i_platform_admin: { Args: never; Returns: boolean }
      apply_template_import: {
        Args: {
          _content: Json
          _import_id: string
          _language: string
          _name_ar: string
          _name_en: string
          _page_setup?: Json
        }
        Returns: string
      }
      approve_contract_version: {
        Args: { _note?: string; _version_id: string }
        Returns: string
      }
      approve_disbursement_request: {
        Args: { _note?: string; _request_id: string }
        Returns: string
      }
      approve_document: {
        Args: { _document_id: string; _note?: string }
        Returns: string
      }
      approve_report: {
        Args: { _note?: string; _version_id: string }
        Returns: string
      }
      approve_stage: {
        Args: { _note?: string; _stage_id: string }
        Returns: string
      }
      archive_report_template: {
        Args: { _template_id: string }
        Returns: string
      }
      build_notification_digest: {
        Args: { _mode?: string }
        Returns: {
          digest_id: string
          item_count: number
        }[]
      }
      can_access_document_version: {
        Args: {
          _action?: Database["public"]["Enums"]["app_action"]
          _version_id: string
        }
        Returns: boolean
      }
      can_access_report_version: {
        Args: {
          _action?: Database["public"]["Enums"]["app_action"]
          _version_id: string
        }
        Returns: boolean
      }
      cancel_financial_document: {
        Args: { _document_id: string; _reason: string }
        Returns: string
      }
      cancel_payment_milestone: {
        Args: { _milestone_id: string; _reason: string }
        Returns: undefined
      }
      cancel_retention_hold: {
        Args: { _hold_id: string; _reason: string }
        Returns: string
      }
      close_project: {
        Args: { _note?: string; _project_id: string }
        Returns: undefined
      }
      close_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: string
      }
      create_document: {
        Args: {
          _category_code: string
          _description?: string
          _owner_entity_id: string
          _title: string
          _visibility?: Database["public"]["Enums"]["doc_visibility"]
        }
        Returns: string
      }
      create_entity_invitation: {
        Args: {
          _email: string
          _entity_id: string
          _role?: Database["public"]["Enums"]["app_role"]
          _valid_days?: number
        }
        Returns: {
          invitation_id: string
          token: string
        }[]
      }
      create_entity_report_template: {
        Args: {
          _content: Json
          _entity_id: string
          _language: string
          _name_ar: string
          _name_en: string
          _page_setup?: Json
        }
        Returns: string
      }
      create_financial_document: {
        Args: {
          _contract_id?: string
          _direction: string
          _doc_number?: string
          _doc_type: string
          _issue_date?: string
          _milestone_id?: string
          _payload?: Json
          _project_id: string
          _references_document_id?: string
          _retention_amount?: number
          _subtotal: number
          _tax_amount?: number
          _tax_rate?: number
        }
        Returns: string
      }
      create_payment_milestone: {
        Args: {
          _amount: number
          _basis?: string
          _contract_id: string
          _due_date?: string
          _percent_of_contract?: number
          _seq?: number
          _stage_id?: string
          _title_ar: string
          _title_en?: string
        }
        Returns: string
      }
      create_report: {
        Args: {
          _entity_id: string
          _language?: string
          _project_id: string
          _property_id?: string
          _stage_id?: string
          _template_id?: string
          _title: string
          _visit_id?: string
        }
        Returns: string
      }
      create_report_version: {
        Args: { _reason?: string; _report_id: string }
        Returns: string
      }
      create_request: {
        Args: {
          _assigned_entity_id?: string
          _assigned_user_id?: string
          _body: string
          _contract_id?: string
          _due_at?: string
          _priority?: string
          _project_id: string
          _property_id?: string
          _property_unit_id?: string
          _request_type_code: string
          _stage_id?: string
          _subject: string
          _submit?: boolean
        }
        Returns: string
      }
      create_retention_hold: {
        Args: {
          _contract_id?: string
          _expected_release_date?: string
          _held_amount: number
          _kind?: string
          _milestone_id?: string
          _project_id: string
          _release_terms_ar?: string
          _release_terms_en?: string
        }
        Returns: string
      }
      create_service_request: {
        Args: {
          _assigned_entity_id?: string
          _assigned_user_id?: string
          _body?: string
          _due_at?: string
          _external_ref_no?: string
          _project_id: string
          _property_id?: string
          _property_unit_id?: string
          _provider_name?: string
          _requirements_note?: string
          _service_code: string
          _stage_id?: string
          _subject: string
          _submit?: boolean
        }
        Returns: string
      }
      create_template_import: {
        Args: {
          _checksum_sha256?: string
          _entity_id: string
          _kind: string
          _mime_type: string
          _owner_scope: string
          _size_bytes: number
        }
        Returns: {
          import_id: string
          storage_bucket: string
          storage_path: string
        }[]
      }
      decide_acceptance: {
        Args: { _acceptance_id: string; _decision: string; _note?: string }
        Returns: undefined
      }
      decide_change_order: {
        Args: { _approve: boolean; _change_order_id: string; _note?: string }
        Returns: string
      }
      decide_contract_extension: {
        Args: { _approve: boolean; _extension_id: string; _note?: string }
        Returns: string
      }
      decide_project_reopen: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: undefined
      }
      decide_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: string
      }
      end_project_party: {
        Args: { _party_id: string; _reason?: string }
        Returns: number
      }
      entity_license_state: {
        Args: { _entity_id: string }
        Returns: {
          expires_on: string
          has_license: boolean
          is_valid: boolean
          license_number: string
          reason: string
        }[]
      }
      execute_disbursement: {
        Args: {
          _external_reference?: string
          _idempotency_key: string
          _method?: string
          _note?: string
          _request_id: string
        }
        Returns: Json
      }
      forfeit_retention: {
        Args: { _hold_id: string; _reason: string }
        Returns: string
      }
      get_project_overview: { Args: { _project_id: string }; Returns: Json }
      invite_project_party: {
        Args: {
          _ends_on?: string
          _party_entity_id: string
          _party_role: Database["public"]["Enums"]["project_party_role"]
          _permissions?: Json
          _project_id: string
          _scope_text_ar?: string
          _scope_text_en?: string
          _stage_ids?: string[]
          _starts_on?: string
        }
        Returns: string
      }
      issue_financial_document: {
        Args: { _document_id: string }
        Returns: string
      }
      link_document: {
        Args: {
          _context_id: string
          _context_type: string
          _document_id: string
          _relation?: string
        }
        Returns: string
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      offboard_member: {
        Args: {
          _entity_id: string
          _reason?: string
          _replacement_user_id?: string
          _user_id: string
        }
        Returns: number
      }
      post_request_message: {
        Args: {
          _body: string
          _kind?: string
          _request_id: string
          _visibility?: string
        }
        Returns: string
      }
      project_completion: { Args: { _project_id: string }; Returns: Json }
      property_completion: { Args: { _property_id: string }; Returns: number }
      publish_portfolio_entry: {
        Args: {
          _is_public?: boolean
          _project_id: string
          _summary_ar?: string
          _summary_en?: string
          _title_ar: string
          _title_en: string
        }
        Returns: string
      }
      raise_punch_item: {
        Args: {
          _acceptance_id?: string
          _assigned_user_id?: string
          _description?: string
          _due_at?: string
          _project_id: string
          _severity?: string
          _title: string
        }
        Returns: string
      }
      record_acceptance_inspection: {
        Args: { _acceptance_id: string; _note?: string }
        Returns: undefined
      }
      record_reinspection: {
        Args: {
          _action_id: string
          _note?: string
          _observation_id: string
          _result: string
          _visit_id?: string
        }
        Returns: string
      }
      record_report_export: {
        Args: { _kind: string; _path: string; _version_id: string }
        Returns: boolean
      }
      record_template_import_parse: {
        Args: {
          _blocks_created: number
          _dropped_report: Json
          _error_text?: string
          _import_id: string
          _status: string
          _warnings: Json
        }
        Returns: boolean
      }
      register_warranty: {
        Args: {
          _document_id?: string
          _ends_on: string
          _project_id: string
          _provider_kind?: string
          _provider_name?: string
          _provider_party_id?: string
          _scope_kind?: string
          _starts_on: string
          _system_code?: string
          _title: string
          _warranty_type: string
        }
        Returns: string
      }
      reject_disbursement_request: {
        Args: { _reason: string; _request_id: string }
        Returns: string
      }
      release_retention: {
        Args: {
          _amount: number
          _document_id?: string
          _hold_id: string
          _note?: string
        }
        Returns: Json
      }
      request_acceptance: {
        Args: { _phase: string; _project_id: string }
        Returns: string
      }
      request_completion: {
        Args: { _note?: string; _subject_id: string; _subject_kind: string }
        Returns: string
      }
      request_more_info: {
        Args: { _body: string; _request_id: string }
        Returns: string
      }
      request_project_reopen: {
        Args: { _project_id: string; _reason: string }
        Returns: string
      }
      request_reminder: {
        Args: { _body?: string; _request_id: string }
        Returns: string
      }
      resolve_notification_target: {
        Args: { _notification_id: string }
        Returns: Json
      }
      respond_to_project_party: {
        Args: { _accept: boolean; _party_id: string }
        Returns: string
      }
      restore_document: { Args: { _document_id: string }; Returns: boolean }
      resubmit_disbursement_request: {
        Args: {
          _evidence: Json
          _gross_amount: number
          _note?: string
          _rejected_request_id: string
          _retention_amount?: number
        }
        Returns: string
      }
      reverse_ledger_entry: {
        Args: { _entry_id: string; _reason: string }
        Returns: string
      }
      review_and_link_service: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: string
      }
      review_report_template: {
        Args: { _note?: string; _template_id: string }
        Returns: string
      }
      revise_financial_document: {
        Args: {
          _change_reason: string
          _document_id: string
          _payload?: Json
          _retention_amount?: number
          _subtotal: number
          _tax_amount?: number
          _tax_rate?: number
        }
        Returns: string
      }
      run_duration_scan: { Args: never; Returns: Json }
      save_report_draft: {
        Args: { _content: Json; _page_setup?: Json; _version_id: string }
        Returns: string
      }
      search_projects: {
        Args: { _limit?: number; _q: string }
        Returns: {
          city: string
          code: string
          district: string
          match_field: string
          name: string
          project_id: string
          status: string
        }[]
      }
      set_closure_item_status: {
        Args: {
          _document_id?: string
          _item_id: string
          _reason?: string
          _status: string
        }
        Returns: undefined
      }
      set_document_visibility: {
        Args: {
          _audience_entity_ids?: string[]
          _audience_user_ids?: string[]
          _document_id: string
          _visibility: Database["public"]["Enums"]["doc_visibility"]
        }
        Returns: Database["public"]["Enums"]["doc_visibility"]
      }
      set_punch_item_status: {
        Args: { _item_id: string; _status: string }
        Returns: undefined
      }
      soft_delete_document: {
        Args: { _document_id: string; _reason: string }
        Returns: string
      }
      start_disbursement_review: {
        Args: { _note?: string; _request_id: string }
        Returns: string
      }
      submit_disbursement_request: {
        Args: {
          _evidence: Json
          _gross_amount: number
          _milestone_id: string
          _note?: string
          _resubmitted_from?: string
          _retention_amount?: number
        }
        Returns: string
      }
      submit_report_version: { Args: { _version_id: string }; Returns: string }
      submit_stage: {
        Args: { _note?: string; _stage_id: string }
        Returns: string
      }
      unlink_document: { Args: { _link_id: string }; Returns: boolean }
      update_report_template: {
        Args: {
          _content?: Json
          _name_ar?: string
          _name_en?: string
          _page_setup?: Json
          _template_id: string
        }
        Returns: string
      }
      update_service_request_details: {
        Args: {
          _account_no?: string
          _appointment_at?: string
          _external_ref_no?: string
          _meter_no?: string
          _payment_amount?: number
          _payment_ref?: string
          _payment_status?: string
          _provider_name?: string
          _request_id: string
          _requirements_note?: string
        }
        Returns: string
      }
      upsert_escalation_policy: {
        Args: {
          _contract_id?: string
          _entity_id: string
          _name_ar: string
          _name_en: string
          _policy_id?: string
          _project_id: string
          _steps: Json
          _subject_kind: string
          _trigger_after_hours: number
        }
        Returns: string
      }
      upsert_rakeez_template: {
        Args: {
          _code: string
          _content: Json
          _language: string
          _name_ar: string
          _name_en: string
          _page_setup?: Json
          _template_id: string
        }
        Returns: string
      }
      verify_report: {
        Args: { _token: string }
        Returns: {
          approved_at: string
          entity_name: string
          report_number: string
          status: string
        }[]
      }
    }
    Enums: {
      app_action:
        | "view"
        | "create"
        | "update"
        | "soft_delete"
        | "approve"
        | "execute"
        | "export"
        | "share"
        | "manage_members"
        | "view_exact"
      app_module:
        | "projects"
        | "stages"
        | "contracts"
        | "documents"
        | "finance"
        | "correspondence"
        | "reports"
        | "members"
        | "properties"
      app_role: "owner" | "admin" | "manager" | "member" | "viewer"
      doc_visibility:
        | "entity_private"
        | "requester_private"
        | "party_limited"
        | "project_wide"
        | "public_approved"
      project_party_role:
        | "design_office"
        | "supervision"
        | "contractor"
        | "inspector"
        | "insurance"
        | "accounting"
        | "legal"
        | "supplier"
      report_status: "draft" | "pending_approval" | "approved" | "superseded"
      report_version_status: "draft" | "pending_approval" | "approved"
      visibility_level: "internal" | "limited" | "project_wide"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_action: [
        "view",
        "create",
        "update",
        "soft_delete",
        "approve",
        "execute",
        "export",
        "share",
        "manage_members",
        "view_exact",
      ],
      app_module: [
        "projects",
        "stages",
        "contracts",
        "documents",
        "finance",
        "correspondence",
        "reports",
        "members",
        "properties",
      ],
      app_role: ["owner", "admin", "manager", "member", "viewer"],
      doc_visibility: [
        "entity_private",
        "requester_private",
        "party_limited",
        "project_wide",
        "public_approved",
      ],
      project_party_role: [
        "design_office",
        "supervision",
        "contractor",
        "inspector",
        "insurance",
        "accounting",
        "legal",
        "supplier",
      ],
      report_status: ["draft", "pending_approval", "approved", "superseded"],
      report_version_status: ["draft", "pending_approval", "approved"],
      visibility_level: ["internal", "limited", "project_wide"],
    },
  },
} as const
