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
          city: string | null
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
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
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
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
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
      advance_service_request: {
        Args: { _note?: string; _request_id: string; _to_status: string }
        Returns: string
      }
      approve_contract_version: {
        Args: { _note?: string; _version_id: string }
        Returns: string
      }
      approve_stage: {
        Args: { _note?: string; _stage_id: string }
        Returns: string
      }
      close_request: {
        Args: { _reason?: string; _request_id: string }
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
      decide_change_order: {
        Args: { _approve: boolean; _change_order_id: string; _note?: string }
        Returns: string
      }
      decide_contract_extension: {
        Args: { _approve: boolean; _extension_id: string; _note?: string }
        Returns: string
      }
      decide_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: string
      }
      end_project_party: {
        Args: { _party_id: string; _reason?: string }
        Returns: number
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
      property_completion: { Args: { _property_id: string }; Returns: number }
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
      request_more_info: {
        Args: { _body: string; _request_id: string }
        Returns: string
      }
      request_reminder: {
        Args: { _body?: string; _request_id: string }
        Returns: string
      }
      respond_to_project_party: {
        Args: { _accept: boolean; _party_id: string }
        Returns: string
      }
      review_and_link_service: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: string
      }
      submit_stage: {
        Args: { _note?: string; _stage_id: string }
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
      project_party_role:
        | "design_office"
        | "supervision"
        | "contractor"
        | "inspector"
        | "insurance"
        | "accounting"
        | "legal"
        | "supplier"
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
      visibility_level: ["internal", "limited", "project_wide"],
    },
  },
} as const
