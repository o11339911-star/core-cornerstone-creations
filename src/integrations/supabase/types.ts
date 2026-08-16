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
      appointment_participants: {
        Row: {
          appointment_id: string
          created_at: string
          entity_id: string
          id: string
          reminder_channel: string
          side: string
          user_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          entity_id: string
          id?: string
          reminder_channel?: string
          side: string
          user_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          entity_id?: string
          id?: string
          reminder_channel?: string
          side?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_participants_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_participants_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancel_deadline_at: string
          cancel_reason: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          duration_minutes: number
          id: string
          kind: string
          listing_id: string | null
          notes: string | null
          provider_entity_id: string
          provider_timezone: string
          requester_entity_id: string
          requester_timezone: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          cancel_deadline_at: string
          cancel_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          duration_minutes?: number
          id?: string
          kind: string
          listing_id?: string | null
          notes?: string | null
          provider_entity_id: string
          provider_timezone: string
          requester_entity_id: string
          requester_timezone: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          cancel_deadline_at?: string
          cancel_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          duration_minutes?: number
          id?: string
          kind?: string
          listing_id?: string | null
          notes?: string | null
          provider_entity_id?: string
          provider_timezone?: string
          requester_entity_id?: string
          requester_timezone?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "service_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_provider_entity_id_fkey"
            columns: ["provider_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_requester_entity_id_fkey"
            columns: ["requester_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_folders: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string | null
          id: string
          name: string
          owner_user_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id?: string | null
          id?: string
          name: string
          owner_user_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_folders_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "archive_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_items: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string | null
          folder_id: string | null
          id: string
          kind: string
          mime_type: string | null
          note: string | null
          owner_user_id: string
          size_bytes: number | null
          source_id: string | null
          source_table: string | null
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id?: string | null
          folder_id?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          note?: string | null
          owner_user_id: string
          size_bytes?: number | null
          source_id?: string | null
          source_table?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string | null
          folder_id?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          note?: string | null
          owner_user_id?: string
          size_bytes?: number | null
          source_id?: string | null
          source_table?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "archive_items_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "archive_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "archive_folders"
            referencedColumns: ["id"]
          },
        ]
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
      call_sessions: {
        Row: {
          accepted_at: string | null
          answered_user_id: string | null
          appointment_id: string
          callee_entity_id: string
          caller_entity_id: string
          caller_user_id: string
          created_at: string
          duration_seconds: number | null
          end_reason: string | null
          ended_at: string | null
          id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          answered_user_id?: string | null
          appointment_id: string
          callee_entity_id: string
          caller_entity_id: string
          caller_user_id: string
          created_at?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          answered_user_id?: string | null
          appointment_id?: string
          callee_entity_id?: string
          caller_entity_id?: string
          caller_user_id?: string
          created_at?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_callee_entity_id_fkey"
            columns: ["callee_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_caller_entity_id_fkey"
            columns: ["caller_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      call_signals: {
        Row: {
          call_id: string
          created_at: string
          id: string
          kind: string
          payload: Json
          sender_entity_id: string
          sender_user_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          id?: string
          kind: string
          payload: Json
          sender_entity_id: string
          sender_user_id?: string
        }
        Update: {
          call_id?: string
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          sender_entity_id?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_sender_entity_id_fkey"
            columns: ["sender_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          buyer_entity_id: string
          created_at: string
          created_by: string
          id: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          buyer_entity_id: string
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          buyer_entity_id?: string
          created_at?: string
          created_by?: string
          id?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_buyer_entity_id_fkey"
            columns: ["buyer_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
      contracting_deals: {
        Row: {
          amount: number | null
          archived_at: string | null
          context_id: string | null
          context_type: string
          counterparty_name: string | null
          created_at: string
          created_by: string
          currency: string
          entity_id: string | null
          id: string
          notes: string | null
          owner_user_id: string
          second_party_status: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          archived_at?: string | null
          context_id?: string | null
          context_type?: string
          counterparty_name?: string | null
          created_at?: string
          created_by: string
          currency?: string
          entity_id?: string | null
          id?: string
          notes?: string | null
          owner_user_id: string
          second_party_status?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          archived_at?: string | null
          context_id?: string | null
          context_type?: string
          counterparty_name?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          entity_id?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string
          second_party_status?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracting_deals_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
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
      core_free_actions: {
        Row: {
          code: string
          created_at: string
          description_ar: string
        }
        Insert: {
          code: string
          created_at?: string
          description_ar: string
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string
        }
        Relationships: []
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
      data_incidents: {
        Row: {
          affected_scope_ar: string
          authority_notified_at: string | null
          contained_at: string | null
          created_at: string
          data_categories: string[]
          detected_at: string
          id: string
          lessons_ar: string | null
          notification_required: boolean
          reported_by: string | null
          root_cause_ar: string | null
          severity: string
          status: string
          subjects_estimate: number | null
          subjects_notified_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_scope_ar: string
          authority_notified_at?: string | null
          contained_at?: string | null
          created_at?: string
          data_categories?: string[]
          detected_at?: string
          id?: string
          lessons_ar?: string | null
          notification_required?: boolean
          reported_by?: string | null
          root_cause_ar?: string | null
          severity: string
          status?: string
          subjects_estimate?: number | null
          subjects_notified_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_scope_ar?: string
          authority_notified_at?: string | null
          contained_at?: string | null
          created_at?: string
          data_categories?: string[]
          detected_at?: string
          id?: string
          lessons_ar?: string | null
          notification_required?: boolean
          reported_by?: string | null
          root_cause_ar?: string | null
          severity?: string
          status?: string
          subjects_estimate?: number | null
          subjects_notified_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      data_processing_register: {
        Row: {
          active: boolean
          activity_ar: string
          activity_code: string
          backing_objects: string[]
          created_at: string
          cross_border: boolean
          data_categories: string[]
          deletion_mechanism_ar: string
          id: string
          legal_basis_ar: string
          module: Database["public"]["Enums"]["app_module"]
          purpose_ar: string
          recipients: string[]
          retention_months: number | null
          retention_period_ar: string
          subject_categories: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          activity_ar: string
          activity_code: string
          backing_objects?: string[]
          created_at?: string
          cross_border?: boolean
          data_categories?: string[]
          deletion_mechanism_ar: string
          id?: string
          legal_basis_ar: string
          module: Database["public"]["Enums"]["app_module"]
          purpose_ar: string
          recipients?: string[]
          retention_months?: number | null
          retention_period_ar: string
          subject_categories?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          activity_ar?: string
          activity_code?: string
          backing_objects?: string[]
          created_at?: string
          cross_border?: boolean
          data_categories?: string[]
          deletion_mechanism_ar?: string
          id?: string
          legal_basis_ar?: string
          module?: Database["public"]["Enums"]["app_module"]
          purpose_ar?: string
          recipients?: string[]
          retention_months?: number | null
          retention_period_ar?: string
          subject_categories?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      deal_parties: {
        Row: {
          acceptance_status: string
          cr_number: string | null
          created_at: string
          deal_id: string
          display_name: string
          id: string
          identifier_fingerprint: string | null
          identifier_kind: string | null
          identifier_last4: string | null
          is_registered: boolean
          matched_entity_id: string | null
          matched_user_id: string | null
          party_kind: string
          party_role: string
          responded_at: string | null
          responded_by: string | null
          updated_at: string
        }
        Insert: {
          acceptance_status?: string
          cr_number?: string | null
          created_at?: string
          deal_id: string
          display_name: string
          id?: string
          identifier_fingerprint?: string | null
          identifier_kind?: string | null
          identifier_last4?: string | null
          is_registered?: boolean
          matched_entity_id?: string | null
          matched_user_id?: string | null
          party_kind: string
          party_role: string
          responded_at?: string | null
          responded_by?: string | null
          updated_at?: string
        }
        Update: {
          acceptance_status?: string
          cr_number?: string | null
          created_at?: string
          deal_id?: string
          display_name?: string
          id?: string
          identifier_fingerprint?: string | null
          identifier_kind?: string | null
          identifier_last4?: string | null
          is_registered?: boolean
          matched_entity_id?: string | null
          matched_user_id?: string | null
          party_kind?: string
          party_role?: string
          responded_at?: string | null
          responded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_parties_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "contracting_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_parties_matched_entity_id_fkey"
            columns: ["matched_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
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
          document_version_id: string | null
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
          document_version_id?: string | null
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
          document_version_id?: string | null
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
          {
            foreignKeyName: "deed_versions_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
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
      document_analyses: {
        Row: {
          analysis_confirmed_at: string | null
          analysis_confirmed_by: string | null
          attempt_no: number
          completed_at: string | null
          conflicts: Json
          corrected_fields: Json
          created_at: string
          created_by: string
          detected_type: string | null
          document_id: string
          document_version_id: string
          engine: string
          extracted_fields: Json
          failure_reason: string | null
          field_confidence: Json
          id: string
          original_fields: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          started_at: string
          status: string
        }
        Insert: {
          analysis_confirmed_at?: string | null
          analysis_confirmed_by?: string | null
          attempt_no?: number
          completed_at?: string | null
          conflicts?: Json
          corrected_fields?: Json
          created_at?: string
          created_by: string
          detected_type?: string | null
          document_id: string
          document_version_id: string
          engine: string
          extracted_fields?: Json
          failure_reason?: string | null
          field_confidence?: Json
          id?: string
          original_fields?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          analysis_confirmed_at?: string | null
          analysis_confirmed_by?: string | null
          attempt_no?: number
          completed_at?: string | null
          conflicts?: Json
          corrected_fields?: Json
          created_at?: string
          created_by?: string
          detected_type?: string | null
          document_id?: string
          document_version_id?: string
          engine?: string
          extracted_fields?: Json
          failure_reason?: string | null
          field_confidence?: Json
          id?: string
          original_fields?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_analyses_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
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
      dpia_controls: {
        Row: {
          control_type: string
          created_at: string
          description_ar: string
          dpia_id: string
          effectiveness_ar: string
          id: string
          object_name: string
        }
        Insert: {
          control_type: string
          created_at?: string
          description_ar: string
          dpia_id: string
          effectiveness_ar?: string
          id?: string
          object_name: string
        }
        Update: {
          control_type?: string
          created_at?: string
          description_ar?: string
          dpia_id?: string
          effectiveness_ar?: string
          id?: string
          object_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dpia_controls_dpia_id_fkey"
            columns: ["dpia_id"]
            isOneToOne: false
            referencedRelation: "dpia_register"
            referencedColumns: ["id"]
          },
        ]
      }
      dpia_register: {
        Row: {
          assessed_at: string
          assessed_by: string | null
          created_at: string
          id: string
          module: Database["public"]["Enums"]["app_module"]
          residual_risk_ar: string
          review_due_at: string | null
          risk_level: string
          risks: Json
          scope_ar: string
          scope_code: string
          updated_at: string
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string | null
          created_at?: string
          id?: string
          module: Database["public"]["Enums"]["app_module"]
          residual_risk_ar: string
          review_due_at?: string | null
          risk_level?: string
          risks?: Json
          scope_ar: string
          scope_code: string
          updated_at?: string
        }
        Update: {
          assessed_at?: string
          assessed_by?: string | null
          created_at?: string
          id?: string
          module?: Database["public"]["Enums"]["app_module"]
          residual_risk_ar?: string
          review_due_at?: string | null
          risk_level?: string
          risks?: Json
          scope_ar?: string
          scope_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      drawing_conversion_jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string
          document_version_id: string
          drawing_id: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by: string
          document_version_id: string
          drawing_id: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string
          document_version_id?: string
          drawing_id?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_conversion_jobs_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_conversion_jobs_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_markups: {
        Row: {
          anchor: Json
          body: string
          created_at: string
          created_by: string
          document_version_id: string
          drawing_id: string
          id: string
          page_no: number
          request_id: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          anchor?: Json
          body: string
          created_at?: string
          created_by: string
          document_version_id: string
          drawing_id: string
          id?: string
          page_no?: number
          request_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          anchor?: Json
          body?: string
          created_at?: string
          created_by?: string
          document_version_id?: string
          drawing_id?: string
          id?: string
          page_no?: number
          request_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_markups_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_markups_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_markups_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_module_settings: {
        Row: {
          aps_client_id_env: string
          aps_client_secret_env: string
          aps_enabled: boolean
          id: boolean
          updated_at: string
        }
        Insert: {
          aps_client_id_env?: string
          aps_client_secret_env?: string
          aps_enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Update: {
          aps_client_id_env?: string
          aps_client_secret_env?: string
          aps_enabled?: boolean
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      drawing_records: {
        Row: {
          created_at: string
          created_by: string
          discipline: string
          document_id: string
          drawing_no: string
          id: string
          owner_entity_id: string
          project_id: string
          sheet_no: string | null
          status: string
          superseded_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          discipline: string
          document_id: string
          drawing_no: string
          id?: string
          owner_entity_id: string
          project_id: string
          sheet_no?: string | null
          status?: string
          superseded_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          discipline?: string
          document_id?: string
          drawing_no?: string
          id?: string
          owner_entity_id?: string
          project_id?: string
          sheet_no?: string | null
          status?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_records_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_records_owner_entity_id_fkey"
            columns: ["owner_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_records_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "drawing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_status_events: {
        Row: {
          actor_id: string
          created_at: string
          drawing_id: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          drawing_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          drawing_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_status_events_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_status_transitions: {
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
      drawing_version_meta: {
        Row: {
          created_at: string
          created_by: string
          document_version_id: string
          drawing_id: string
          format: string
          id: string
          revision_label: string
          scan_notes: Json
          sheet_count: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          document_version_id: string
          drawing_id: string
          format: string
          id?: string
          revision_label: string
          scan_notes?: Json
          sheet_count?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          document_version_id?: string
          drawing_id?: string
          format?: string
          id?: string
          revision_label?: string
          scan_notes?: Json
          sheet_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drawing_version_meta_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: true
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_version_meta_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_viewer_state: {
        Row: {
          drawing_id: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          drawing_id: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          drawing_id?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_viewer_state_drawing_id_fkey"
            columns: ["drawing_id"]
            isOneToOne: false
            referencedRelation: "drawing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      dsr_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note_ar: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note_ar?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note_ar?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsr_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "dsr_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      dsr_requests: {
        Row: {
          closed_at: string | null
          created_at: string
          decision_ar: string | null
          details_ar: string
          due_at: string
          id: string
          identity_method: string | null
          identity_verified_at: string | null
          kind: string
          queue_item_id: string | null
          restriction_reasons: string[]
          result_ref: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          decision_ar?: string | null
          details_ar: string
          due_at?: string
          id?: string
          identity_method?: string | null
          identity_verified_at?: string | null
          kind: string
          queue_item_id?: string | null
          restriction_reasons?: string[]
          result_ref?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          decision_ar?: string | null
          details_ar?: string
          due_at?: string
          id?: string
          identity_method?: string | null
          identity_verified_at?: string | null
          kind?: string
          queue_item_id?: string | null
          restriction_reasons?: string[]
          result_ref?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsr_requests_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "platform_queue_items"
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
      economic_activities: {
        Row: {
          active: boolean
          code: string
          created_at: string
          keywords_ar: string[]
          keywords_en: string[]
          level: number
          name_ar: string
          name_en: string
          parent_code: string | null
          source: string
          updated_at: string
          version: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          keywords_ar?: string[]
          keywords_en?: string[]
          level: number
          name_ar: string
          name_en: string
          parent_code?: string | null
          source: string
          updated_at?: string
          version: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          keywords_ar?: string[]
          keywords_en?: string[]
          level?: number
          name_ar?: string
          name_en?: string
          parent_code?: string | null
          source?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
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
      entitlements: {
        Row: {
          code: string
          created_at: string
          description_ar: string
          description_en: string
          is_commercial: boolean
        }
        Insert: {
          code: string
          created_at?: string
          description_ar: string
          description_en: string
          is_commercial?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string
          description_en?: string
          is_commercial?: boolean
        }
        Relationships: []
      }
      entity_activities: {
        Row: {
          activity_code: string
          activity_version: string
          created_at: string
          created_by: string
          entity_id: string
          id: string
          is_primary: boolean
          updated_at: string
        }
        Insert: {
          activity_code: string
          activity_version: string
          created_at?: string
          created_by?: string
          entity_id: string
          id?: string
          is_primary?: boolean
          updated_at?: string
        }
        Update: {
          activity_code?: string
          activity_version?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_activities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_correspondence: {
        Row: {
          archived_at: string | null
          body: string
          channel: string
          counterparty_address: string | null
          counterparty_name: string | null
          created_at: string
          created_by: string
          direction: string
          entity_id: string | null
          id: string
          owner_user_id: string
          project_id: string | null
          request_id: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body?: string
          channel: string
          counterparty_address?: string | null
          counterparty_name?: string | null
          created_at?: string
          created_by: string
          direction?: string
          entity_id?: string | null
          id?: string
          owner_user_id: string
          project_id?: string | null
          request_id?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          channel?: string
          counterparty_address?: string | null
          counterparty_name?: string | null
          created_at?: string
          created_by?: string
          direction?: string
          entity_id?: string | null
          id?: string
          owner_user_id?: string
          project_id?: string | null
          request_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_correspondence_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_correspondence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_correspondence_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_entitlements: {
        Row: {
          code: string
          created_at: string
          entity_id: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          entity_id: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          entity_id?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_entitlements_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "entity_entitlements_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
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
      entity_messaging_channels: {
        Row: {
          channel: string
          created_at: string
          entity_id: string
          from_address: string | null
          id: string
          note: string | null
          provider: string | null
          secret_env_name: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          entity_id: string
          from_address?: string | null
          id?: string
          note?: string | null
          provider?: string | null
          secret_env_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          entity_id?: string
          from_address?: string | null
          id?: string
          note?: string | null
          provider?: string | null
          secret_env_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_messaging_channels_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_profiles: {
        Row: {
          additional_no: string | null
          address_text: string | null
          building_no: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          cr_number: string | null
          created_at: string
          district: string | null
          entity_id: string
          legal_form: string | null
          legal_form_code: string | null
          legal_name_ar: string | null
          legal_name_en: string | null
          logo_path: string | null
          postal_code: string | null
          responsible_email: string | null
          responsible_name: string | null
          responsible_phone: string | null
          responsible_title: string | null
          street: string | null
          tax_number: string | null
          unified_national_number: string | null
          updated_at: string
          verification_note: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          additional_no?: string | null
          address_text?: string | null
          building_no?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cr_number?: string | null
          created_at?: string
          district?: string | null
          entity_id: string
          legal_form?: string | null
          legal_form_code?: string | null
          legal_name_ar?: string | null
          legal_name_en?: string | null
          logo_path?: string | null
          postal_code?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          responsible_title?: string | null
          street?: string | null
          tax_number?: string | null
          unified_national_number?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          additional_no?: string | null
          address_text?: string | null
          building_no?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cr_number?: string | null
          created_at?: string
          district?: string | null
          entity_id?: string
          legal_form?: string | null
          legal_form_code?: string | null
          legal_name_ar?: string | null
          legal_name_en?: string | null
          logo_path?: string | null
          postal_code?: string | null
          responsible_email?: string | null
          responsible_name?: string | null
          responsible_phone?: string | null
          responsible_title?: string | null
          street?: string | null
          tax_number?: string | null
          unified_national_number?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_status?: string
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
          {
            foreignKeyName: "entity_profiles_legal_form_code_fkey"
            columns: ["legal_form_code"]
            isOneToOne: false
            referencedRelation: "legal_forms"
            referencedColumns: ["code"]
          },
        ]
      }
      entity_public_profiles: {
        Row: {
          activity_ar: string | null
          activity_en: string | null
          bio_ar: string | null
          bio_en: string | null
          created_at: string
          display_name_ar: string
          display_name_en: string | null
          entity_id: string
          is_published: boolean
          logo_url: string | null
          portfolio_opt_in: boolean
          public_email: string | null
          public_phone: string | null
          published_at: string | null
          regions: string[]
          services: string[]
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          activity_ar?: string | null
          activity_en?: string | null
          bio_ar?: string | null
          bio_en?: string | null
          created_at?: string
          display_name_ar: string
          display_name_en?: string | null
          entity_id: string
          is_published?: boolean
          logo_url?: string | null
          portfolio_opt_in?: boolean
          public_email?: string | null
          public_phone?: string | null
          published_at?: string | null
          regions?: string[]
          services?: string[]
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          activity_ar?: string | null
          activity_en?: string | null
          bio_ar?: string | null
          bio_en?: string | null
          created_at?: string
          display_name_ar?: string
          display_name_en?: string | null
          entity_id?: string
          is_published?: boolean
          logo_url?: string | null
          portfolio_opt_in?: boolean
          public_email?: string | null
          public_phone?: string | null
          published_at?: string | null
          regions?: string[]
          services?: string[]
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_public_profiles_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relationships: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          ends_on: string | null
          id: string
          ownership_percent: number | null
          relationship_type: string
          source_entity_id: string
          starts_on: string
          status: string
          target_entity_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          ends_on?: string | null
          id?: string
          ownership_percent?: number | null
          relationship_type: string
          source_entity_id: string
          starts_on?: string
          status?: string
          target_entity_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          ends_on?: string | null
          id?: string
          ownership_percent?: number | null
          relationship_type?: string
          source_entity_id?: string
          starts_on?: string
          status?: string
          target_entity_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_target_entity_id_fkey"
            columns: ["target_entity_id"]
            isOneToOne: false
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
      entity_subscription_state: {
        Row: {
          created_at: string
          entity_id: string
          grace_until: string | null
          plan_code: string
          policy_note: string | null
          read_only_since: string | null
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          grace_until?: string | null
          plan_code?: string
          policy_note?: string | null
          read_only_since?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          grace_until?: string | null
          plan_code?: string
          policy_note?: string | null
          read_only_since?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_subscription_state_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
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
      feature_flag_countries: {
        Row: {
          code: string
          country_code: string
          created_at: string
        }
        Insert: {
          code: string
          country_code: string
          created_at?: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_countries_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["code"]
          },
        ]
      }
      feature_flags: {
        Row: {
          code: string
          created_at: string
          description_ar: string
          enabled_globally: boolean
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description_ar: string
          enabled_globally?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description_ar?: string
          enabled_globally?: boolean
          updated_at?: string
        }
        Relationships: []
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
      integration_failure_counters: {
        Row: {
          failure_count: number
          integration_id: string
          last_notified_at: string | null
          updated_at: string
          window_started_at: string
        }
        Insert: {
          failure_count?: number
          integration_id: string
          last_notified_at?: string | null
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          failure_count?: number
          integration_id?: string
          last_notified_at?: string | null
          updated_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_failure_counters_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integration_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_registry: {
        Row: {
          active: boolean
          agreement_status: string
          code: string
          created_at: string
          exchanged_fields: Json
          failure_threshold: number
          id: string
          idempotency_scope: string
          legal_basis: string | null
          live_approval_ref: string | null
          provider_name_ar: string
          provider_name_en: string
          purpose: string
          rate_limit_per_minute: number
          retry_policy: Json
          secret_env_names: string[]
          status: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          active?: boolean
          agreement_status?: string
          code: string
          created_at?: string
          exchanged_fields?: Json
          failure_threshold?: number
          id?: string
          idempotency_scope?: string
          legal_basis?: string | null
          live_approval_ref?: string | null
          provider_name_ar: string
          provider_name_en: string
          purpose: string
          rate_limit_per_minute?: number
          retry_policy?: Json
          secret_env_names?: string[]
          status?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          active?: boolean
          agreement_status?: string
          code?: string
          created_at?: string
          exchanged_fields?: Json
          failure_threshold?: number
          id?: string
          idempotency_scope?: string
          legal_basis?: string | null
          live_approval_ref?: string | null
          provider_name_ar?: string
          provider_name_en?: string
          purpose?: string
          rate_limit_per_minute?: number
          retry_policy?: Json
          secret_env_names?: string[]
          status?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      integration_requests: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          direction: string
          entity_id: string | null
          first_attempt_at: string | null
          id: string
          idempotency_key: string
          integration_id: string
          last_attempt_at: string | null
          max_attempts: number
          operation: string
          project_id: string | null
          request_payload: Json
          response_payload: Json | null
          safe_error: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          entity_id?: string | null
          first_attempt_at?: string | null
          id?: string
          idempotency_key: string
          integration_id: string
          last_attempt_at?: string | null
          max_attempts?: number
          operation: string
          project_id?: string | null
          request_payload?: Json
          response_payload?: Json | null
          safe_error?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string
          entity_id?: string | null
          first_attempt_at?: string | null
          id?: string
          idempotency_key?: string
          integration_id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          operation?: string
          project_id?: string | null
          request_payload?: Json
          response_payload?: Json | null
          safe_error?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_requests_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_requests_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integration_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      legal_document_versions: {
        Row: {
          body_md: string
          created_at: string
          created_by: string | null
          document_id: string
          effective_date: string
          id: string
          is_current: boolean
          published_at: string | null
          requires_acceptance: boolean
          updated_at: string
          version: string
        }
        Insert: {
          body_md: string
          created_at?: string
          created_by?: string | null
          document_id: string
          effective_date: string
          id?: string
          is_current?: boolean
          published_at?: string | null
          requires_acceptance?: boolean
          updated_at?: string
          version: string
        }
        Update: {
          body_md?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          effective_date?: string
          id?: string
          is_current?: boolean
          published_at?: string | null
          requires_acceptance?: boolean
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          code: string
          created_at: string
          id: string
          slug: string
          title_ar: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          slug: string
          title_ar: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          slug?: string
          title_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_forms: {
        Row: {
          active: boolean
          code: string
          created_at: string
          name_ar: string
          name_en: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          name_ar: string
          name_en: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      license_versions: {
        Row: {
          created_at: string
          created_by: string
          document_version_id: string | null
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
          document_version_id?: string | null
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
          document_version_id?: string | null
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
            foreignKeyName: "license_versions_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_versions_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "building_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_assets: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_assets_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_assets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contract_amounts: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          currency: string
          id: string
          kind: string
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          currency?: string
          id?: string
          kind: string
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contract_amounts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketing_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contract_units: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          property_unit_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          property_unit_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          property_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contract_units_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contract_units_property_unit_id_fkey"
            columns: ["property_unit_id"]
            isOneToOne: false
            referencedRelation: "property_units"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contracts: {
        Row: {
          channels: string[]
          content_rights: string | null
          created_at: string
          created_by: string
          ends_on: string | null
          exclusivity: string
          id: string
          lead_rights: string | null
          marketer_entity_id: string
          price_authority: string
          profile_id: string
          report_rights: string | null
          starts_on: string
          status: string
          terminated_at: string | null
          terminated_by: string | null
          termination_reason: string | null
          termination_terms: string | null
          updated_at: string
        }
        Insert: {
          channels?: string[]
          content_rights?: string | null
          created_at?: string
          created_by: string
          ends_on?: string | null
          exclusivity?: string
          id?: string
          lead_rights?: string | null
          marketer_entity_id: string
          price_authority?: string
          profile_id: string
          report_rights?: string | null
          starts_on: string
          status?: string
          terminated_at?: string | null
          terminated_by?: string | null
          termination_reason?: string | null
          termination_terms?: string | null
          updated_at?: string
        }
        Update: {
          channels?: string[]
          content_rights?: string | null
          created_at?: string
          created_by?: string
          ends_on?: string | null
          exclusivity?: string
          id?: string
          lead_rights?: string | null
          marketer_entity_id?: string
          price_authority?: string
          profile_id?: string
          report_rights?: string | null
          starts_on?: string
          status?: string
          terminated_at?: string | null
          terminated_by?: string | null
          termination_reason?: string | null
          termination_terms?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contracts_marketer_entity_id_fkey"
            columns: ["marketer_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contracts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          channel_code: string | null
          contact_email: string | null
          contact_phone: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          full_name: string
          id: string
          note: string | null
          profile_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          channel_code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          full_name: string
          id?: string
          note?: string | null
          profile_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          channel_code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          full_name?: string
          id?: string
          note?: string | null
          profile_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_packages: {
        Row: {
          channel_code: string | null
          contract_id: string
          created_at: string
          expires_at: string
          id: string
          issued_by: string
          license_number_snapshot: string
          marketer_entity_id: string
          package_no: number
          revoked_at: string | null
          revoked_by: string | null
          verify_token: string
          version_id: string
          watermark_text: string
        }
        Insert: {
          channel_code?: string | null
          contract_id: string
          created_at?: string
          expires_at: string
          id?: string
          issued_by: string
          license_number_snapshot: string
          marketer_entity_id: string
          package_no: number
          revoked_at?: string | null
          revoked_by?: string | null
          verify_token: string
          version_id: string
          watermark_text: string
        }
        Update: {
          channel_code?: string | null
          contract_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string
          license_number_snapshot?: string
          marketer_entity_id?: string
          package_no?: number
          revoked_at?: string | null
          revoked_by?: string | null
          verify_token?: string
          version_id?: string
          watermark_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_packages_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "marketing_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_packages_marketer_entity_id_fkey"
            columns: ["marketer_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_packages_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "marketing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_profiles: {
        Row: {
          channel_mode: string
          created_at: string
          created_by: string
          id: string
          owner_entity_id: string | null
          project_id: string
          readiness_basis: string
          status: string
          updated_at: string
        }
        Insert: {
          channel_mode?: string
          created_at?: string
          created_by: string
          id?: string
          owner_entity_id?: string | null
          project_id: string
          readiness_basis: string
          status?: string
          updated_at?: string
        }
        Update: {
          channel_mode?: string
          created_at?: string
          created_by?: string
          id?: string
          owner_entity_id?: string | null
          project_id?: string
          readiness_basis?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_profiles_owner_entity_id_fkey"
            columns: ["owner_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          description_ar: string | null
          description_en: string | null
          id: string
          listing_price: number | null
          price_currency: string
          profile_id: string
          status: string
          title_ar: string
          title_en: string | null
          units_snapshot: Json
          version_no: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          listing_price?: number | null
          price_currency?: string
          profile_id: string
          status?: string
          title_ar: string
          title_en?: string | null
          units_snapshot?: Json
          version_no: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          listing_price?: number | null
          price_currency?: string
          profile_id?: string
          status?: string
          title_ar?: string
          title_en?: string | null
          units_snapshot?: Json
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_versions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "marketing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_asset_versions: {
        Row: {
          asset_id: string
          checksum: string | null
          created_at: string
          created_by: string
          id: string
          is_blurred: boolean
          object_path: string
          version_no: number
        }
        Insert: {
          asset_id: string
          checksum?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_blurred?: boolean
          object_path: string
          version_no: number
        }
        Update: {
          asset_id?: string
          checksum?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_blurred?: boolean
          object_path?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_asset_versions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          blur_ack_at: string | null
          blur_ack_by: string | null
          blur_ack_text: string | null
          blurred_object_path: string | null
          created_at: string
          created_by: string
          id: string
          kind: string
          project_id: string
          raw_object_path: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shoot_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          blur_ack_at?: string | null
          blur_ack_by?: string | null
          blur_ack_text?: string | null
          blurred_object_path?: string | null
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          project_id: string
          raw_object_path: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shoot_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          blur_ack_at?: string | null
          blur_ack_by?: string | null
          blur_ack_text?: string | null
          blurred_object_path?: string | null
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          project_id?: string
          raw_object_path?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shoot_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "media_shoot_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      media_publications: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          project_id: string
          public_object_path: string
          public_token: string
          published_at: string
          published_by: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          project_id: string
          public_object_path: string
          public_token: string
          published_at?: string
          published_by: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          project_id?: string
          public_object_path?: string
          public_token?: string
          published_at?: string
          published_by?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_publications_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_publications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      media_shoot_attendance: {
        Row: {
          accuracy_m: number | null
          checked_in_at: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          shoot_id: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          checked_in_at?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          shoot_id: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          checked_in_at?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          shoot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_shoot_attendance_shoot_id_fkey"
            columns: ["shoot_id"]
            isOneToOne: false
            referencedRelation: "media_shoot_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      media_shoot_requests: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          photographer_entity_id: string | null
          photographer_user_id: string | null
          project_id: string
          property_id: string | null
          requested_by: string
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          photographer_entity_id?: string | null
          photographer_user_id?: string | null
          project_id: string
          property_id?: string | null
          requested_by: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          photographer_entity_id?: string | null
          photographer_user_id?: string | null
          project_id?: string
          property_id?: string | null
          requested_by?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_shoot_requests_photographer_entity_id_fkey"
            columns: ["photographer_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_shoot_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_shoot_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_shoot_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties_public"
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
      order_items: {
        Row: {
          id: string
          name_snapshot: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          name_snapshot: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          name_snapshot?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "store_products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          method: string
          order_id: string
          receipt_path: string | null
          receipt_uploaded_at: string | null
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          method: string
          order_id: string
          receipt_path?: string | null
          receipt_uploaded_at?: string | null
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          receipt_path?: string | null
          receipt_uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_entity_id: string
          cart_id: string | null
          country_code: string
          created_at: string
          currency: string
          id: string
          payment_method: string
          placed_by: string
          status: string
          store_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_entity_id: string
          cart_id?: string | null
          country_code: string
          created_at?: string
          currency?: string
          id?: string
          payment_method: string
          placed_by?: string
          status?: string
          store_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          buyer_entity_id?: string
          cart_id?: string | null
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string
          placed_by?: string
          status?: string
          store_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_entity_id_fkey"
            columns: ["buyer_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
      platform_breakglass_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denied_reason: string | null
          expires_at: string | null
          grant_id: string | null
          id: string
          project_id: string
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["breakglass_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          denied_reason?: string | null
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          project_id: string
          reason: string
          requested_by: string
          status?: Database["public"]["Enums"]["breakglass_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          denied_reason?: string | null
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          project_id?: string
          reason?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["breakglass_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_breakglass_requests_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "permission_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_breakglass_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_case_access: {
        Row: {
          created_at: string
          expires_at: string
          grant_id: string
          granted_by: string
          id: string
          project_id: string
          queue_item_id: string
          reason: string
          revoked_at: string | null
          staff_user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          grant_id: string
          granted_by: string
          id?: string
          project_id: string
          queue_item_id: string
          reason: string
          revoked_at?: string | null
          staff_user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          grant_id?: string
          granted_by?: string
          id?: string
          project_id?: string
          queue_item_id?: string
          reason?: string
          revoked_at?: string | null
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_case_access_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "permission_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_case_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_case_access_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "platform_queue_items"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_queue_items: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          close_reason: string | null
          created_at: string
          entity_id: string | null
          id: string
          priority: number
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_id: string
          source_table: string
          source_type: Database["public"]["Enums"]["platform_queue_source"]
          status: Database["public"]["Enums"]["platform_queue_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          close_reason?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          priority?: number
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_id: string
          source_table: string
          source_type: Database["public"]["Enums"]["platform_queue_source"]
          status?: Database["public"]["Enums"]["platform_queue_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          close_reason?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          priority?: number
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string
          source_table?: string
          source_type?: Database["public"]["Enums"]["platform_queue_source"]
          status?: Database["public"]["Enums"]["platform_queue_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_queue_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "platform_queue_items_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_queue_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_staff: {
        Row: {
          active: boolean
          availability: Database["public"]["Enums"]["platform_availability"]
          created_at: string
          max_concurrent: number
          note: string | null
          role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          availability?: Database["public"]["Enums"]["platform_availability"]
          created_at?: string
          max_concurrent?: number
          note?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          availability?: Database["public"]["Enums"]["platform_availability"]
          created_at?: string
          max_concurrent?: number
          note?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      policy_acceptances: {
        Row: {
          accepted_at: string
          context: string
          created_at: string
          document_id: string
          id: string
          ip_hash: string | null
          user_agent_hash: string | null
          user_id: string
          version_id: string
        }
        Insert: {
          accepted_at?: string
          context?: string
          created_at?: string
          document_id: string
          id?: string
          ip_hash?: string | null
          user_agent_hash?: string | null
          user_id: string
          version_id: string
        }
        Update: {
          accepted_at?: string
          context?: string
          created_at?: string
          document_id?: string
          id?: string
          ip_hash?: string | null
          user_agent_hash?: string | null
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acceptances_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "legal_document_versions"
            referencedColumns: ["id"]
          },
        ]
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
          address: string | null
          approx_lat: number | null
          approx_lng: number | null
          city: string | null
          code: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          district: string | null
          entity_id: string | null
          frontage: string | null
          id: string
          kind: string
          land_area: number | null
          land_use: string | null
          name: string
          notes: string | null
          owner_id: string
          parcel_no: string | null
          plan_no: string | null
          region: string | null
          status: string
          streets: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          approx_lat?: number | null
          approx_lng?: number | null
          city?: string | null
          code?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          district?: string | null
          entity_id?: string | null
          frontage?: string | null
          id?: string
          kind: string
          land_area?: number | null
          land_use?: string | null
          name: string
          notes?: string | null
          owner_id: string
          parcel_no?: string | null
          plan_no?: string | null
          region?: string | null
          status?: string
          streets?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          approx_lat?: number | null
          approx_lng?: number | null
          city?: string | null
          code?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          district?: string | null
          entity_id?: string | null
          frontage?: string | null
          id?: string
          kind?: string
          land_area?: number | null
          land_use?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          parcel_no?: string | null
          plan_no?: string | null
          region?: string | null
          status?: string
          streets?: string | null
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
          is_primary: boolean
          national_id_masked: string | null
          owner_entity_id: string | null
          owner_legal_form: string | null
          owner_name_text: string | null
          owner_source: string | null
          owner_unified_number: string | null
          owner_user_id: string | null
          owner_verification_status: string | null
          property_id: string
          share_percent: number
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_primary?: boolean
          national_id_masked?: string | null
          owner_entity_id?: string | null
          owner_legal_form?: string | null
          owner_name_text?: string | null
          owner_source?: string | null
          owner_unified_number?: string | null
          owner_user_id?: string | null
          owner_verification_status?: string | null
          property_id: string
          share_percent: number
          starts_on?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_primary?: boolean
          national_id_masked?: string | null
          owner_entity_id?: string | null
          owner_legal_form?: string | null
          owner_name_text?: string | null
          owner_source?: string | null
          owner_unified_number?: string | null
          owner_user_id?: string | null
          owner_verification_status?: string | null
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
      service_listing_areas: {
        Row: {
          city: string | null
          country_code: string
          created_at: string
          id: string
          listing_id: string
          region: string | null
        }
        Insert: {
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          listing_id: string
          region?: string | null
        }
        Update: {
          city?: string | null
          country_code?: string
          created_at?: string
          id?: string
          listing_id?: string
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_listing_areas_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "service_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_listings: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          description: string
          entity_id: string
          id: string
          price_max: number | null
          price_min: number | null
          project_id: string | null
          published_at: string | null
          request_id: string | null
          service_kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          description: string
          entity_id: string
          id?: string
          price_max?: number | null
          price_min?: number | null
          project_id?: string | null
          published_at?: string | null
          request_id?: string | null
          service_kind: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          description?: string
          entity_id?: string
          id?: string
          price_max?: number | null
          price_min?: number | null
          project_id?: string | null
          published_at?: string | null
          request_id?: string | null
          service_kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_listings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_listings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_listings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
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
      store_products: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          country_code: string
          created_at: string
          entity_id: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          entity_id: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          entity_id?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
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
      abort_document_upload: {
        Args: { _reason?: string; _version_id: string }
        Returns: boolean
      }
      accept_entity_invitation: { Args: { _token: string }; Returns: string }
      accept_policies: {
        Args: { _context?: string; _version_ids: string[] }
        Returns: number
      }
      activate_marketing_contract: {
        Args: { _contract_id: string }
        Returns: undefined
      }
      activate_report_template: {
        Args: { _template_id: string }
        Returns: string
      }
      add_cart_item: {
        Args: { _cart_id: string; _product_id: string; _quantity: number }
        Returns: undefined
      }
      add_contract_person_party: {
        Args: { _contract_id: string; _contract_role: string; _user_id: string }
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
      add_drawing_markup: {
        Args: {
          _anchor?: Json
          _body: string
          _document_version_id: string
          _drawing_id: string
          _page_no?: number
        }
        Returns: string
      }
      add_drawing_version: {
        Args: {
          _checksum_sha256: string
          _drawing_id: string
          _file_ext: string
          _mime_type: string
          _revision_label: string
          _size_bytes: number
          _supersede_reason?: string
        }
        Returns: {
          storage_bucket: string
          storage_path: string
          version_id: string
          version_no: number
        }[]
      }
      add_marketing_contract_unit: {
        Args: { _contract_id: string; _property_unit_id: string }
        Returns: undefined
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
      add_store_product: {
        Args: {
          _description?: string
          _name: string
          _price: number
          _store_id: string
        }
        Returns: string
      }
      admin_list_entities: {
        Args: { _limit?: number; _offset?: number; _q?: string }
        Returns: {
          created_at: string
          entity_id: string
          legal_form: string
          members_count: number
          name: string
          owner_name: string
          status: string
          total_count: number
          type: string
          unified_national_number: string
          verification_status: string
        }[]
      }
      admin_list_users: {
        Args: { _limit?: number; _offset?: number; _q?: string }
        Returns: {
          active_memberships: number
          created_at: string
          email: string
          email_confirmed: boolean
          full_name: string
          identity_last4: string
          identity_status: string
          last_sign_in_at: string
          phone: string
          registration_complete: boolean
          total_count: number
          user_id: string
        }[]
      }
      admin_search_identities: { Args: { _query: string }; Returns: Json }
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
      approve_breakglass: {
        Args: { _minutes?: number; _request_id: string }
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
      approve_marketing_version: {
        Args: { _version_id: string }
        Returns: undefined
      }
      approve_media_asset: {
        Args: { _approve: boolean; _asset_id: string; _reason?: string }
        Returns: undefined
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
      archive_service_listing: {
        Args: { _listing_id: string }
        Returns: undefined
      }
      assign_media_photographer: {
        Args: {
          _photographer_entity_id?: string
          _photographer_user_id?: string
          _scheduled_at?: string
          _shoot_id: string
        }
        Returns: undefined
      }
      attach_blurred_media_version: {
        Args: {
          _ack_text: string
          _asset_id: string
          _checksum?: string
          _object_path: string
        }
        Returns: undefined
      }
      attach_payment_receipt: {
        Args: { _order_id: string; _receipt_path: string }
        Returns: undefined
      }
      auto_assign_queue_item: { Args: { _item_id: string }; Returns: string }
      begin_integration_request: {
        Args: {
          _code: string
          _entity_id?: string
          _idempotency_key: string
          _operation: string
          _payload?: Json
          _project_id?: string
        }
        Returns: Json
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
      can_manage_property_self: {
        Args: { _property_id: string }
        Returns: boolean
      }
      cancel_appointment: {
        Args: { _appointment_id: string; _reason?: string }
        Returns: undefined
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
      check_in_media_shoot: {
        Args: {
          _accuracy_m?: number
          _lat?: number
          _lng?: number
          _shoot_id: string
        }
        Returns: string
      }
      close_dsr_request: {
        Args: { _note_ar: string; _request_id: string }
        Returns: undefined
      }
      close_project: {
        Args: { _note?: string; _project_id: string }
        Returns: undefined
      }
      close_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: string
      }
      complete_appointment: {
        Args: { _appointment_id: string }
        Returns: undefined
      }
      complete_document_analysis: {
        Args: {
          _analysis_id: string
          _conflicts?: Json
          _detected_type?: string
          _engine: string
          _extracted_fields?: Json
          _failure_reason?: string
          _field_confidence?: Json
          _status: string
        }
        Returns: string
      }
      complete_integration_request: {
        Args: {
          _error?: string
          _ok: boolean
          _request_id: string
          _response?: Json
        }
        Returns: Json
      }
      complete_registration_entity: {
        Args: {
          _legal_form: string
          _name: string
          _type: string
          _unified_national_number: string
        }
        Returns: string
      }
      confirm_appointment: {
        Args: { _appointment_id: string }
        Returns: undefined
      }
      confirm_document_analysis: {
        Args: {
          _analysis_id: string
          _area?: number
          _corrected_fields?: Json
          _date_1?: string
          _date_2?: string
          _head_id?: string
          _issuer?: string
          _number?: string
          _owner_snapshot?: string
          _property_id: string
          _scope_text?: string
          _target: string
        }
        Returns: string
      }
      confirm_order_payment: { Args: { _order_id: string }; Returns: undefined }
      create_cart: {
        Args: { _buyer_entity_id: string; _store_id: string }
        Returns: string
      }
      create_contracting_deal: {
        Args: {
          _amount: number
          _context_id: string
          _context_type: string
          _cr_number: string
          _currency: string
          _display_name: string
          _entity_id: string
          _identifier_fingerprint: string
          _identifier_last4: string
          _notes: string
          _party_kind: string
          _title: string
        }
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
      create_drawing: {
        Args: {
          _discipline: string
          _drawing_no: string
          _owner_entity_id: string
          _project_id: string
          _sheet_no?: string
          _title: string
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
      create_entity_with_owner: {
        Args: {
          _additional_no?: string
          _building_no?: string
          _city?: string
          _contact_email?: string
          _contact_phone?: string
          _cr_number?: string
          _district?: string
          _legal_form: string
          _legal_name_ar?: string
          _legal_name_en?: string
          _name: string
          _postal_code?: string
          _responsible_email?: string
          _responsible_name?: string
          _responsible_phone?: string
          _responsible_title?: string
          _street?: string
          _tax_number?: string
          _type: string
          _unified_national_number?: string
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
      create_marketing_contract: {
        Args: {
          _channels?: string[]
          _content_rights?: string
          _ends_on: string
          _exclusivity?: string
          _lead_rights?: string
          _marketer_entity_id: string
          _price_authority?: string
          _profile_id: string
          _report_rights?: string
          _starts_on: string
          _termination_terms?: string
        }
        Returns: string
      }
      create_marketing_profile: {
        Args: {
          _channel_mode?: string
          _project_id: string
          _readiness_basis: string
        }
        Returns: string
      }
      create_marketing_version: {
        Args: {
          _description_ar?: string
          _description_en?: string
          _listing_price?: number
          _price_currency?: string
          _profile_id: string
          _title_ar: string
          _title_en?: string
          _units_snapshot?: Json
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
      create_project_assignment: {
        Args: {
          _ends_on?: string
          _entity_id: string
          _job_title_ar: string
          _job_title_en: string
          _project_id: string
          _stage_id?: string
          _starts_on?: string
          _user_id: string
          _visibility?: string
        }
        Returns: string
      }
      create_property_with_owner: {
        Args: {
          _address?: string
          _approx_lat?: number
          _approx_lng?: number
          _city?: string
          _district?: string
          _entity_id?: string
          _frontage?: string
          _kind: string
          _land_area?: number
          _land_use?: string
          _name: string
          _notes?: string
          _parcel_no?: string
          _plan_no?: string
          _region?: string
          _streets?: string
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
      decide_dsr_request: {
        Args: {
          _decision_ar: string
          _outcome: string
          _request_id: string
          _restrictions?: string[]
          _result_ref?: Json
        }
        Returns: undefined
      }
      decide_entity_relationship: {
        Args: { _accept: boolean; _relationship_id: string }
        Returns: boolean
      }
      decide_project_reopen: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: undefined
      }
      decide_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: string
      }
      deny_breakglass: {
        Args: { _reason: string; _request_id: string }
        Returns: undefined
      }
      end_project_party: {
        Args: { _party_id: string; _reason?: string }
        Returns: number
      }
      enqueue_drawing_conversion: {
        Args: { _document_version_id: string }
        Returns: {
          job_id: string
          provider: string
          status: string
        }[]
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
      evaluate_erasure_constraints: {
        Args: { _user_id?: string }
        Returns: Json
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
      export_entity_data: { Args: { _entity_id: string }; Returns: Json }
      export_my_data: { Args: never; Returns: Json }
      forfeit_retention: {
        Args: { _hold_id: string; _reason: string }
        Returns: string
      }
      get_dsr_events: {
        Args: { _request_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note_ar: string | null
          request_id: string
          to_status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dsr_request_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_dsr_timer: { Args: { _request_id: string }; Returns: Json }
      get_entity_official: { Args: { _entity_id: string }; Returns: Json }
      get_legal_document: { Args: { _code: string }; Returns: Json }
      get_my_identity_status: { Args: never; Returns: Json }
      get_project_overview: { Args: { _project_id: string }; Returns: Json }
      get_public_entity_profile: { Args: { _slug: string }; Returns: Json }
      get_public_media: { Args: { _token: string }; Returns: Json }
      get_registration_completion_state: { Args: never; Returns: Json }
      grant_case_access: {
        Args: {
          _item_id: string
          _minutes: number
          _reason: string
          _staff_user_id: string
        }
        Returns: string
      }
      grant_entity_entitlement: {
        Args: { _code: string; _entity_id: string; _expires_at?: string }
        Returns: undefined
      }
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
      issue_marketing_package: {
        Args: {
          _channel_code?: string
          _contract_id: string
          _expires_at: string
          _version_id: string
          _watermark_text?: string
        }
        Returns: Json
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
      link_drawing_markup_request: {
        Args: { _markup_id: string; _request_id: string }
        Returns: undefined
      }
      link_marketing_asset: {
        Args: { _document_id: string; _profile_id: string }
        Returns: undefined
      }
      link_personal_identity: { Args: { _national_id: string }; Returns: Json }
      link_property_project: {
        Args: { _project_id: string; _property_id: string; _relation?: string }
        Returns: Json
      }
      list_breakglass_requests: {
        Args: never
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denied_reason: string | null
          expires_at: string | null
          grant_id: string | null
          id: string
          project_id: string
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["breakglass_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_breakglass_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_data_incidents: {
        Args: never
        Returns: {
          affected_scope_ar: string
          authority_notified_at: string | null
          contained_at: string | null
          created_at: string
          data_categories: string[]
          detected_at: string
          id: string
          lessons_ar: string | null
          notification_required: boolean
          reported_by: string | null
          root_cause_ar: string | null
          severity: string
          status: string
          subjects_estimate: number | null
          subjects_notified_at: string | null
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "data_incidents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_data_processing_register: {
        Args: never
        Returns: {
          active: boolean
          activity_ar: string
          activity_code: string
          backing_objects: string[]
          created_at: string
          cross_border: boolean
          data_categories: string[]
          deletion_mechanism_ar: string
          id: string
          legal_basis_ar: string
          module: Database["public"]["Enums"]["app_module"]
          purpose_ar: string
          recipients: string[]
          retention_months: number | null
          retention_period_ar: string
          subject_categories: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "data_processing_register"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_dpia: { Args: never; Returns: Json }
      list_dpia_register: { Args: never; Returns: Json }
      list_dsr_events: {
        Args: { _request_id: string }
        Returns: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note_ar: string | null
          request_id: string
          to_status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dsr_request_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_dsr_requests: {
        Args: { _status?: string }
        Returns: {
          closed_at: string | null
          created_at: string
          decision_ar: string | null
          details_ar: string
          due_at: string
          id: string
          identity_method: string | null
          identity_verified_at: string | null
          kind: string
          queue_item_id: string | null
          restriction_reasons: string[]
          result_ref: Json | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dsr_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_entity_team: {
        Args: { _entity_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          full_name: string
          is_self: boolean
          membership_id: string
          phone: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }[]
      }
      list_integration_requests: {
        Args: { _code?: string; _limit?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          direction: string
          entity_id: string | null
          first_attempt_at: string | null
          id: string
          idempotency_key: string
          integration_id: string
          last_attempt_at: string | null
          max_attempts: number
          operation: string
          project_id: string | null
          request_payload: Json
          response_payload: Json | null
          safe_error: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_integrations: {
        Args: never
        Returns: {
          active: boolean
          agreement_status: string
          code: string
          created_at: string
          exchanged_fields: Json
          failure_threshold: number
          id: string
          idempotency_scope: string
          legal_basis: string | null
          live_approval_ref: string | null
          provider_name_ar: string
          provider_name_en: string
          purpose: string
          rate_limit_per_minute: number
          retry_policy: Json
          secret_env_names: string[]
          status: string
          updated_at: string
          webhook_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_registry"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_legal_documents: {
        Args: never
        Returns: {
          code: string
          effective_date: string
          slug: string
          title_ar: string
          version: string
        }[]
      }
      list_link_candidate_projects: {
        Args: {
          _limit?: number
          _offset?: number
          _property_id: string
          _q?: string
        }
        Returns: {
          code: string
          counterparty_name: string
          name: string
          project_id: string
          source: string
          status: string
          total_count: number
        }[]
      }
      list_link_candidate_properties: {
        Args: {
          _limit?: number
          _offset?: number
          _project_id: string
          _q?: string
        }
        Returns: {
          code: string
          counterparty_name: string
          name: string
          property_id: string
          source: string
          status: string
          total_count: number
        }[]
      }
      list_my_dsr_requests: {
        Args: never
        Returns: {
          closed_at: string | null
          created_at: string
          decision_ar: string | null
          details_ar: string
          due_at: string
          id: string
          identity_method: string | null
          identity_verified_at: string | null
          kind: string
          queue_item_id: string | null
          restriction_reasons: string[]
          result_ref: Json | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dsr_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_my_policy_acceptances: {
        Args: never
        Returns: {
          accepted_at: string
          code: string
          context: string
          title_ar: string
          version: string
        }[]
      }
      list_platform_staff: {
        Args: never
        Returns: {
          active: boolean
          availability: Database["public"]["Enums"]["platform_availability"]
          current_load: number
          full_name: string
          max_concurrent: number
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }[]
      }
      list_processing_register: {
        Args: never
        Returns: {
          active: boolean
          activity_ar: string
          activity_code: string
          backing_objects: string[]
          created_at: string
          cross_border: boolean
          data_categories: string[]
          deletion_mechanism_ar: string
          id: string
          legal_basis_ar: string
          module: Database["public"]["Enums"]["app_module"]
          purpose_ar: string
          recipients: string[]
          retention_months: number | null
          retention_period_ar: string
          subject_categories: string[]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "data_processing_register"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_project_assignable_members: {
        Args: { _project_id: string }
        Returns: {
          entity_id: string
          entity_name: string
          full_name: string
          user_id: string
        }[]
      }
      list_queue_items: {
        Args: { _mine?: boolean; _status?: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          close_reason: string | null
          created_at: string
          entity_id: string | null
          id: string
          priority: number
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_id: string
          source_table: string
          source_type: Database["public"]["Enums"]["platform_queue_source"]
          status: Database["public"]["Enums"]["platform_queue_status"]
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_queue_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_data_incident: {
        Args: {
          _affected_scope_ar: string
          _data_categories?: string[]
          _notification_required?: boolean
          _severity: string
          _subjects_estimate?: number
          _title: string
        }
        Returns: string
      }
      lookup_identity_for_contract: {
        Args: { _national_id: string; _project_id: string }
        Returns: Json
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
      open_store: {
        Args: { _country_code: string; _entity_id: string; _name: string }
        Returns: string
      }
      pending_policy_acceptances: {
        Args: never
        Returns: {
          code: string
          document_id: string
          effective_date: string
          title_ar: string
          version: string
          version_id: string
        }[]
      }
      place_order: {
        Args: { _cart_id: string; _payment_method: string }
        Returns: string
      }
      platform_me: { Args: never; Returns: Json }
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
      propose_appointment: {
        Args: {
          _cancel_hours?: number
          _duration_minutes?: number
          _kind: string
          _listing_id?: string
          _notes?: string
          _provider_entity_id: string
          _provider_timezone: string
          _requester_entity_id: string
          _requester_timezone: string
          _starts_at: string
          _title: string
        }
        Returns: string
      }
      publish_legal_version: {
        Args: {
          _body_md: string
          _code: string
          _effective_date: string
          _requires_acceptance?: boolean
          _version: string
        }
        Returns: string
      }
      publish_media_asset: {
        Args: { _asset_id: string; _public_object_path: string }
        Returns: string
      }
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
      publish_service_listing: {
        Args: {
          _areas?: Json
          _description: string
          _entity_id: string
          _price_max?: number
          _price_min?: number
          _project_id?: string
          _publish?: boolean
          _request_id?: string
          _service_kind: string
          _title: string
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
      reassign_queue_item: {
        Args: { _item_id: string; _reason: string; _to_user: string }
        Returns: undefined
      }
      record_acceptance_inspection: {
        Args: { _acceptance_id: string; _note?: string }
        Returns: undefined
      }
      record_marketing_lead: {
        Args: {
          _channel_code?: string
          _contact_email?: string
          _contact_phone?: string
          _contract_id: string
          _full_name: string
          _note?: string
        }
        Returns: string
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
      register_media_asset: {
        Args: {
          _checksum?: string
          _kind?: string
          _raw_object_path: string
          _shoot_id: string
          _title: string
        }
        Returns: string
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
      reject_document_analysis: {
        Args: { _analysis_id: string; _reason: string }
        Returns: boolean
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
      report_data_incident: {
        Args: {
          _affected_scope_ar: string
          _data_categories?: string[]
          _detected_at: string
          _notification_required?: boolean
          _root_cause_ar?: string
          _severity: string
          _subjects_estimate?: number
          _title: string
        }
        Returns: string
      }
      request_acceptance: {
        Args: { _phase: string; _project_id: string }
        Returns: string
      }
      request_breakglass: {
        Args: { _project_id: string; _reason: string }
        Returns: string
      }
      request_completion: {
        Args: { _note?: string; _subject_id: string; _subject_kind: string }
        Returns: string
      }
      request_entity_relationship: {
        Args: {
          _ownership_percent?: number
          _relationship_type: string
          _source_entity_id: string
          _target_slug: string
        }
        Returns: string
      }
      request_media_shoot: {
        Args: {
          _notes?: string
          _project_id: string
          _property_id?: string
          _scheduled_at?: string
        }
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
      resolve_drawing_markup: {
        Args: { _markup_id: string }
        Returns: undefined
      }
      resolve_notification_target: {
        Args: { _notification_id: string }
        Returns: Json
      }
      resolve_public_media_object: { Args: { _token: string }; Returns: string }
      resolve_queue_item: {
        Args: { _item_id: string; _reason: string }
        Returns: undefined
      }
      respond_contracting_deal: {
        Args: { _accept: boolean; _deal_id: string }
        Returns: string
      }
      respond_to_project_party: {
        Args: { _accept: boolean; _party_id: string }
        Returns: string
      }
      restore_document: { Args: { _document_id: string }; Returns: boolean }
      restore_subscription: { Args: { _entity_id: string }; Returns: undefined }
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
      review_media_asset: {
        Args: { _approve: boolean; _asset_id: string; _reason?: string }
        Returns: undefined
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
      revoke_case_access: { Args: { _case_id: string }; Returns: undefined }
      revoke_entity_entitlement: {
        Args: { _code: string; _entity_id: string }
        Returns: undefined
      }
      revoke_marketing_package: {
        Args: { _package_id: string }
        Returns: undefined
      }
      revoke_media_publication: {
        Args: { _publication_id: string; _reason: string }
        Returns: undefined
      }
      run_duration_scan: { Args: never; Returns: Json }
      save_drawing_viewer_state: {
        Args: { _drawing_id: string; _state: Json }
        Returns: undefined
      }
      save_report_draft: {
        Args: { _content: Json; _page_setup?: Json; _version_id: string }
        Returns: string
      }
      search_economic_activities: {
        Args: { _limit?: number; _q: string; _version?: string }
        Returns: {
          code: string
          level: number
          name_ar: string
          name_en: string
          parent_code: string
          path_ar: string
          score: number
        }[]
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
      set_drawing_status: {
        Args: { _drawing_id: string; _note?: string; _to_status: string }
        Returns: undefined
      }
      set_entity_public_publish: {
        Args: {
          _entity_id: string
          _is_published: boolean
          _portfolio_opt_in?: boolean
        }
        Returns: boolean
      }
      set_entity_slug: {
        Args: { _entity_id: string; _slug: string }
        Returns: string
      }
      set_integration_status: {
        Args: { _code: string; _status: string }
        Returns: undefined
      }
      set_listing_archived: {
        Args: { _archived: boolean; _listing_id: string }
        Returns: undefined
      }
      set_listing_context: {
        Args: {
          _listing_id: string
          _project_id?: string
          _request_id?: string
        }
        Returns: undefined
      }
      set_marketing_contract_amount: {
        Args: {
          _amount: number
          _contract_id: string
          _currency?: string
          _kind: string
        }
        Returns: undefined
      }
      set_marketing_profile_status: {
        Args: { _profile_id: string; _status: string }
        Returns: undefined
      }
      set_platform_staff_state: {
        Args: {
          _availability: Database["public"]["Enums"]["platform_availability"]
          _max_concurrent?: number
          _user_id: string
        }
        Returns: undefined
      }
      set_property_primary_owner: {
        Args: { _entity_id: string; _property_id: string; _reason: string }
        Returns: string
      }
      set_punch_item_status: {
        Args: { _item_id: string; _status: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simulate_subscription_expiry: {
        Args: { _entity_id: string; _grace_days?: number }
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
      start_document_analysis: {
        Args: { _document_version_id: string; _retry?: boolean }
        Returns: string
      }
      start_dsr_review: { Args: { _request_id: string }; Returns: undefined }
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
      submit_dsr_request: {
        Args: { _details_ar: string; _kind: string }
        Returns: string
      }
      submit_media_asset: { Args: { _asset_id: string }; Returns: undefined }
      submit_report_version: { Args: { _version_id: string }; Returns: string }
      submit_stage: {
        Args: { _note?: string; _stage_id: string }
        Returns: string
      }
      svc_auth_throttle: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      svc_identity_backfill_pending: {
        Args: never
        Returns: {
          plain: string
          user_id: string
        }[]
      }
      svc_identity_cipher: {
        Args: { _actor: string; _user_id: string }
        Returns: string
      }
      svc_identity_lookup: { Args: { _fingerprint: string }; Returns: string }
      svc_identity_upsert: {
        Args: {
          _cipher: string
          _fingerprint: string
          _last4: string
          _user_id: string
        }
        Returns: string
      }
      svc_register_identity: {
        Args: { _national_id: string; _user_id: string }
        Returns: undefined
      }
      svc_resolve_identity_login: {
        Args: { _national_id: string }
        Returns: string
      }
      terminate_marketing_contract: {
        Args: { _contract_id: string; _reason: string }
        Returns: undefined
      }
      unlink_document: { Args: { _link_id: string }; Returns: boolean }
      update_data_incident: {
        Args: {
          _authority_notified_at?: string
          _contained_at?: string
          _incident_id: string
          _lessons_ar?: string
          _status?: string
          _subjects_notified_at?: string
        }
        Returns: undefined
      }
      update_entity_official: {
        Args: {
          _additional_no?: string
          _building_no?: string
          _city?: string
          _contact_email?: string
          _contact_phone?: string
          _cr_number?: string
          _district?: string
          _entity_id: string
          _legal_form?: string
          _legal_name_ar?: string
          _legal_name_en?: string
          _postal_code?: string
          _responsible_email?: string
          _responsible_name?: string
          _responsible_phone?: string
          _responsible_title?: string
          _street?: string
          _tax_number?: string
          _unified_national_number?: string
        }
        Returns: boolean
      }
      update_marketing_lead_stage: {
        Args: { _lead_id: string; _stage: string }
        Returns: undefined
      }
      update_project_assignment: {
        Args: {
          _assignment_id: string
          _clear_stage?: boolean
          _end_now?: boolean
          _ends_on?: string
          _job_title_ar?: string
          _job_title_en?: string
          _stage_id?: string
          _starts_on?: string
          _visibility?: string
        }
        Returns: boolean
      }
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
      update_service_listing: {
        Args: {
          _description?: string
          _listing_id: string
          _price_max?: number
          _price_min?: number
          _status?: string
          _title?: string
        }
        Returns: undefined
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
      upsert_entity_public_profile: {
        Args: {
          _activity_ar?: string
          _activity_en?: string
          _bio_ar?: string
          _bio_en?: string
          _display_name_ar: string
          _display_name_en?: string
          _entity_id: string
          _logo_url?: string
          _public_email?: string
          _public_phone?: string
          _regions?: string[]
          _services?: string[]
          _website_url?: string
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
      upsert_integration: {
        Args: {
          _agreement_status?: string
          _code: string
          _exchanged_fields?: Json
          _failure_threshold?: number
          _legal_basis?: string
          _provider_name_ar: string
          _provider_name_en: string
          _purpose: string
          _rate_limit_per_minute?: number
          _retry_policy?: Json
          _secret_env_names?: string[]
          _webhook_url?: string
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
      use_advanced_analytics: { Args: { _entity_id: string }; Returns: Json }
      verify_dsr_identity: {
        Args: { _method: string; _note_ar?: string; _request_id: string }
        Returns: undefined
      }
      verify_marketing_package: { Args: { _token: string }; Returns: Json }
      verify_report: {
        Args: { _token: string }
        Returns: {
          approved_at: string
          entity_name: string
          report_number: string
          status: string
        }[]
      }
      withdraw_media_asset: {
        Args: { _asset_id: string; _reason: string }
        Returns: undefined
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
        | "marketing"
        | "media"
        | "marketplace"
        | "commerce"
        | "integrations"
        | "privacy"
        | "drawings"
      app_role: "owner" | "admin" | "manager" | "member" | "viewer"
      breakglass_status: "pending" | "approved" | "denied" | "expired"
      doc_visibility:
        | "entity_private"
        | "requester_private"
        | "party_limited"
        | "project_wide"
        | "public_approved"
      platform_availability: "available" | "busy" | "on_leave" | "suspended"
      platform_queue_source:
        | "entity_verification"
        | "template_review"
        | "report"
        | "support_ticket"
        | "compliance_task"
        | "dsr_request"
      platform_queue_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "resolved"
        | "closed"
      platform_role: "superadmin" | "reviewer" | "support" | "compliance"
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
        "marketing",
        "media",
        "marketplace",
        "commerce",
        "integrations",
        "privacy",
        "drawings",
      ],
      app_role: ["owner", "admin", "manager", "member", "viewer"],
      breakglass_status: ["pending", "approved", "denied", "expired"],
      doc_visibility: [
        "entity_private",
        "requester_private",
        "party_limited",
        "project_wide",
        "public_approved",
      ],
      platform_availability: ["available", "busy", "on_leave", "suspended"],
      platform_queue_source: [
        "entity_verification",
        "template_review",
        "report",
        "support_ticket",
        "compliance_task",
        "dsr_request",
      ],
      platform_queue_status: [
        "open",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
      ],
      platform_role: ["superadmin", "reviewer", "support", "compliance"],
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
