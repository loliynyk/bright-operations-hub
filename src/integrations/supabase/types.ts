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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      charge_adjustments: {
        Row: {
          actor_id: string | null
          charge_id: string
          created_at: string
          id: string
          new_amount: number
          old_amount: number
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          charge_id: string
          created_at?: string
          id?: string
          new_amount: number
          old_amount: number
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          charge_id?: string
          created_at?: string
          id?: string
          new_amount?: number
          old_amount?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charge_adjustments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charge_adjustments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "v_charge_balances"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          amount: number
          branch_id: string
          client_id: string
          contract_id: string
          created_at: string
          due_date: string
          id: string
          is_prorated: boolean
          paid_amount: number
          period_month: string
          status: Database["public"]["Enums"]["charge_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          client_id: string
          contract_id: string
          created_at?: string
          due_date?: string
          id?: string
          is_prorated?: boolean
          paid_amount?: number
          period_month: string
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          client_id?: string
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          is_prorated?: boolean
          paid_amount?: number
          period_month?: string
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          birth_date: string | null
          branch_id: string
          client_id: string
          created_at: string
          end_date: string | null
          first_name: string
          group_id: string | null
          id: string
          last_name: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["child_status"]
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          branch_id: string
          client_id: string
          created_at?: string
          end_date?: string | null
          first_name: string
          group_id?: string | null
          id?: string
          last_name?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["child_status"]
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          branch_id?: string
          client_id?: string
          created_at?: string
          end_date?: string | null
          first_name?: string
          group_id?: string | null
          id?: string
          last_name?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["child_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      client_attachments: {
        Row: {
          branch_id: string
          client_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          id: string
          mime: string | null
          name: string
          size: number | null
          url: string
        }
        Insert: {
          branch_id: string
          client_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mime?: string | null
          name: string
          size?: number | null
          url: string
        }
        Update: {
          branch_id?: string
          client_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mime?: string | null
          name?: string
          size?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_attachments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_attachments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_attachments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credits: {
        Row: {
          amount_remaining: number
          branch_id: string
          client_id: string
          created_at: string
          id: string
          source_payment_id: string | null
          updated_at: string
        }
        Insert: {
          amount_remaining: number
          branch_id: string
          client_id: string
          created_at?: string
          id?: string
          source_payment_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_remaining?: number
          branch_id?: string
          client_id?: string
          created_at?: string
          id?: string
          source_payment_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_credits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_credits_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          branch_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          lead_id: string | null
          notes: string | null
          parent_first_name: string
          parent_last_name: string
          phone: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          parent_first_name: string
          parent_last_name: string
          phone?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          parent_first_name?: string
          parent_last_name?: string
          phone?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          branch_id: string
          child_id: string | null
          client_id: string
          comment: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          discount_id: string | null
          end_date: string | null
          id: string
          income_category_id: string | null
          manual_discount: number
          monthly_price: number
          number: string
          pdf_path: string | null
          pdf_url: string | null
          plan_id: string | null
          price_version_id: string | null
          recalc_locked: boolean
          service_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          child_id?: string | null
          client_id: string
          comment?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          discount_id?: string | null
          end_date?: string | null
          id?: string
          income_category_id?: string | null
          manual_discount?: number
          monthly_price?: number
          number?: string
          pdf_path?: string | null
          pdf_url?: string | null
          plan_id?: string | null
          price_version_id?: string | null
          recalc_locked?: boolean
          service_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          child_id?: string | null
          client_id?: string
          comment?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          discount_id?: string | null
          end_date?: string | null
          id?: string
          income_category_id?: string | null
          manual_discount?: number
          monthly_price?: number
          number?: string
          pdf_path?: string | null
          pdf_url?: string | null
          plan_id?: string | null
          price_version_id?: string | null
          recalc_locked?: boolean
          service_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_income_category_id_fkey"
            columns: ["income_category_id"]
            isOneToOne: false
            referencedRelation: "income_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_price_version_id_fkey"
            columns: ["price_version_id"]
            isOneToOne: false
            referencedRelation: "price_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["discount_type"]
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          value: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          value: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          position: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          position?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          spent_at: string
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          spent_at?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          spent_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          age_from: number | null
          age_range: string | null
          age_to: number | null
          branch_id: string
          capacity: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          age_from?: number | null
          age_range?: string | null
          age_to?: number | null
          branch_id: string
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          age_from?: number | null
          age_range?: string | null
          age_to?: number | null
          branch_id?: string
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      income_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          branch_id: string | null
          child_birthdate: string | null
          child_first_name: string | null
          child_last_name: string | null
          child_name: string | null
          converted_client_id: string | null
          created_at: string
          created_by: string | null
          desired_start_date: string | null
          id: string
          lost_reason: string | null
          next_action_at: string | null
          notes: string | null
          parent_address: string | null
          parent_email: string | null
          parent_first_name: string | null
          parent_last_name: string | null
          parent_name: string
          parent_phone: string | null
          registration_date: string | null
          service_id: string | null
          source: Database["public"]["Enums"]["lead_source"] | null
          source_form: string | null
          status: Database["public"]["Enums"]["lead_status"]
          trial_date: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          branch_id?: string | null
          child_birthdate?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          desired_start_date?: string | null
          id?: string
          lost_reason?: string | null
          next_action_at?: string | null
          notes?: string | null
          parent_address?: string | null
          parent_email?: string | null
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name: string
          parent_phone?: string | null
          registration_date?: string | null
          service_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          source_form?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          trial_date?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          branch_id?: string | null
          child_birthdate?: string | null
          child_first_name?: string | null
          child_last_name?: string | null
          child_name?: string | null
          converted_client_id?: string | null
          created_at?: string
          created_by?: string | null
          desired_start_date?: string | null
          id?: string
          lost_reason?: string | null
          next_action_at?: string | null
          notes?: string | null
          parent_address?: string | null
          parent_email?: string | null
          parent_first_name?: string | null
          parent_last_name?: string | null
          parent_name?: string
          parent_phone?: string | null
          registration_date?: string | null
          service_id?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          source_form?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          trial_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_client_fk"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_fk"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          created_by: string | null
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          charge_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          payment_id: string
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "v_charge_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string
          client_id: string
          created_at: string
          created_by: string | null
          external_ref: string | null
          id: string
          note: string | null
          paid_at: string
          payment_method_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_method_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          id?: string
          note?: string | null
          paid_at?: string
          payment_method_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      price_versions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          monthly_price: number
          name: string
          plan_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_price: number
          name: string
          plan_id: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          monthly_price?: number
          name?: string
          plan_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          id: string
          income_category_id: string | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          id?: string
          income_category_id?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          income_category_id?: string | null
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_income_category_id_fkey"
            columns: ["income_category_id"]
            isOneToOne: false
            referencedRelation: "income_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          branch_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_id: string | null
          branch_id: string | null
          client_id: string | null
          contract_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          payload: Json
          type: Database["public"]["Enums"]["timeline_event_type"]
        }
        Insert: {
          actor_id?: string | null
          branch_id?: string | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          type: Database["public"]["Enums"]["timeline_event_type"]
        }
        Update: {
          actor_id?: string | null
          branch_id?: string | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          payload?: Json
          type?: Database["public"]["Enums"]["timeline_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_charge_balances: {
        Row: {
          allocated: number | null
          amount: number | null
          branch_id: string | null
          client_id: string | null
          contract_id: string | null
          derived_status: string | null
          due_date: string | null
          id: string | null
          period_month: string | null
          remaining: number | null
        }
        Relationships: [
          {
            foreignKeyName: "charges_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_charge: {
        Args: { _charge_id: string; _new_amount: number; _reason: string }
        Returns: undefined
      }
      apply_credits_to_charge: { Args: { _charge_id: string }; Returns: number }
      complete_child_attendance:
        | {
            Args: { _child_id: string; _end_date: string; _reason: string }
            Returns: Json
          }
        | {
            Args: {
              _child_id: string
              _end_date: string
              _note?: string
              _reason: string
              _reason_code?: string
            }
            Returns: Json
          }
      convert_lead_to_client: {
        Args: { _lead_id: string }
        Returns: {
          child_id: string
          client_id: string
          contract_id: string
        }[]
      }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      post_payment: {
        Args: {
          _allocations: Json
          _amount: number
          _branch_id: string
          _client_id: string
          _external_ref: string
          _note: string
          _paid_at: string
          _payment_method_id: string
        }
        Returns: string
      }
      reallocate_payment: {
        Args: { _allocations: Json; _payment_id: string }
        Returns: undefined
      }
      recompute_charge_status: {
        Args: { _charge_id: string }
        Returns: undefined
      }
      recompute_one_charge: { Args: { _charge_id: string }; Returns: undefined }
      reopen_child_attendance: {
        Args: { _child_id: string; _note?: string }
        Returns: Json
      }
      void_payment: { Args: { _payment_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "teacher" | "accountant"
      charge_status: "pending" | "paid" | "partial" | "cancelled" | "overdue"
      child_status: "active" | "paused" | "graduated" | "archived"
      client_status: "active" | "paused" | "archived"
      contract_status:
        | "draft"
        | "generated"
        | "confirmed"
        | "sent"
        | "signed"
        | "cancelled"
        | "completed"
      discount_type: "percentage" | "fixed"
      lead_source:
        | "instagram"
        | "facebook"
        | "google"
        | "referral"
        | "walk_in"
        | "phone"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "tour_scheduled"
        | "tour_done"
        | "negotiation"
        | "won"
        | "lost"
        | "waiting"
        | "trial"
        | "contract"
        | "converted"
        | "archived"
      payment_status: "posted" | "void"
      timeline_event_type:
        | "lead_created"
        | "status_changed"
        | "client_created"
        | "contract_generated"
        | "pdf_generated"
        | "charges_generated"
        | "note_added"
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
      app_role: ["admin", "manager", "teacher", "accountant"],
      charge_status: ["pending", "paid", "partial", "cancelled", "overdue"],
      child_status: ["active", "paused", "graduated", "archived"],
      client_status: ["active", "paused", "archived"],
      contract_status: [
        "draft",
        "generated",
        "confirmed",
        "sent",
        "signed",
        "cancelled",
        "completed",
      ],
      discount_type: ["percentage", "fixed"],
      lead_source: [
        "instagram",
        "facebook",
        "google",
        "referral",
        "walk_in",
        "phone",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "tour_scheduled",
        "tour_done",
        "negotiation",
        "won",
        "lost",
        "waiting",
        "trial",
        "contract",
        "converted",
        "archived",
      ],
      payment_status: ["posted", "void"],
      timeline_event_type: [
        "lead_created",
        "status_changed",
        "client_created",
        "contract_generated",
        "pdf_generated",
        "charges_generated",
        "note_added",
      ],
    },
  },
} as const
