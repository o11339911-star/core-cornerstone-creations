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
      project_stages: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_required: boolean
          name_ar: string
          name_en: string
          order_index: number
          planned_end: string | null
          planned_start: string | null
          project_id: string
          source: string
          stage_template_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          name_ar: string
          name_en: string
          order_index: number
          planned_end?: string | null
          planned_start?: string | null
          project_id: string
          source?: string
          stage_template_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_required?: boolean
          name_ar?: string
          name_en?: string
          order_index?: number
          planned_end?: string | null
          planned_start?: string | null
          project_id?: string
          source?: string
          stage_template_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          id: string
          notes: string | null
          property_id: string
          reference_no: string | null
          service_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          property_id: string
          reference_no?: string | null
          service_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          property_id?: string
          reference_no?: string | null
          service_type?: string
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
      offboard_member: {
        Args: {
          _entity_id: string
          _reason?: string
          _replacement_user_id?: string
          _user_id: string
        }
        Returns: number
      }
      property_completion: { Args: { _property_id: string }; Returns: number }
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
      visibility_level: ["internal", "limited", "project_wide"],
    },
  },
} as const
