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
      credit_transactions: {
        Row: {
          amount_cents: number
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          kind: string
          payment_method: string | null
          ride_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          payment_method?: string | null
          ride_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          payment_method?: string | null
          ride_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["driver_document_type"]
          driver_id: string
          file_path: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["document_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: Database["public"]["Enums"]["driver_document_type"]
          driver_id: string
          file_path: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["driver_document_type"]
          driver_id?: string
          file_path?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          avatar_path: string | null
          birth_date: string
          city: string
          cpf: string
          created_at: string
          email: string
          full_name: string
          id: string
          neighborhood: string
          phone: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["driver_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          birth_date: string
          city?: string
          cpf: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          neighborhood?: string
          phone: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          birth_date?: string
          city?: string
          cpf?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          neighborhood?: string
          phone?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      eta_traffic_calibration: {
        Row: {
          avg_speed_kmh: number
          hour: number
          samples: number
          source: string
          updated_at: string
          weekday: number
        }
        Insert: {
          avg_speed_kmh: number
          hour: number
          samples?: number
          source?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          avg_speed_kmh?: number
          hour?: number
          samples?: number
          source?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      mercadopago_payments: {
        Row: {
          amount_cents: number
          created_at: string
          expires_at: string | null
          id: string
          idempotency_key: string
          mp_order_id: string | null
          payment_method: string
          qr_code: string | null
          qr_code_base64: string | null
          refund_idempotency_key: string
          ride_id: string
          status: string
          status_detail: string | null
          tutor_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          mp_order_id?: string | null
          payment_method: string
          qr_code?: string | null
          qr_code_base64?: string | null
          refund_idempotency_key?: string
          ride_id: string
          status?: string
          status_detail?: string | null
          tutor_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          mp_order_id?: string | null
          payment_method?: string
          qr_code?: string | null
          qr_code_base64?: string | null
          refund_idempotency_key?: string
          ride_id?: string
          status?: string
          status_detail?: string | null
          tutor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mercadopago_payments_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          breed: string | null
          created_at: string
          health_notes: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          photo_url: string | null
          size: string
          species: string
          temperament: string | null
          transport_items: string[]
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          breed?: string | null
          created_at?: string
          health_notes?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          photo_url?: string | null
          size?: string
          species?: string
          temperament?: string | null
          transport_items?: string[]
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          breed?: string | null
          created_at?: string
          health_notes?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          photo_url?: string | null
          size?: string
          species?: string
          temperament?: string | null
          transport_items?: string[]
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string
          cpf: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          vehicle_model: string | null
          vehicle_plate: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string
          cpf?: string | null
          created_at?: string
          full_name?: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string
          cpf?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
      ride_dispatches: {
        Row: {
          content: string
          created_at: string
          error: string | null
          file_name: string
          id: string
          provider_message_id: string | null
          ride_id: string
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          error?: string | null
          file_name: string
          id?: string
          provider_message_id?: string | null
          ride_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          error?: string | null
          file_name?: string
          id?: string
          provider_message_id?: string | null
          ride_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_dispatches_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          ride_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          ride_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          ride_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_messages_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_pets: {
        Row: {
          created_at: string
          id: string
          pet_id: string
          ride_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pet_id: string
          ride_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pet_id?: string
          ride_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_pets_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          revealed_at: string | null
          reviewee_id: string
          reviewer_id: string
          ride_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          revealed_at?: string | null
          reviewee_id: string
          reviewer_id: string
          ride_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          revealed_at?: string | null
          reviewee_id?: string
          reviewer_id?: string
          ride_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_reviews_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          arrived_at: string | null
          created_at: string
          destination_address: string
          destination_lat: number | null
          destination_lng: number | null
          destination_neighborhood: string | null
          distance_km: number
          driver_id: string | null
          driver_lat: number | null
          driver_lng: number | null
          driver_waits: boolean
          has_return: boolean
          id: string
          location_updated_at: string | null
          needs_trunk: boolean
          notes: string | null
          origin_address: string
          origin_lat: number | null
          origin_lng: number | null
          origin_neighborhood: string | null
          paid_at: string | null
          pet_id: string | null
          pet_name: string
          pet_size: string
          preferred_driver_id: string | null
          preferred_until: string | null
          price_cents: number
          return_fee_cents: number
          return_of_ride_id: string | null
          return_scheduled_at: string | null
          scheduled_at: string
          service_type: string
          share_token: string
          status: Database["public"]["Enums"]["ride_status"]
          stops: Json
          trunk_fee_cents: number
          tutor_id: string
          updated_at: string
          waiting_fee_cents: number
          waiting_minutes: number
        }
        Insert: {
          arrived_at?: string | null
          created_at?: string
          destination_address: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_neighborhood?: string | null
          distance_km?: number
          driver_id?: string | null
          driver_lat?: number | null
          driver_lng?: number | null
          driver_waits?: boolean
          has_return?: boolean
          id?: string
          location_updated_at?: string | null
          needs_trunk?: boolean
          notes?: string | null
          origin_address: string
          origin_lat?: number | null
          origin_lng?: number | null
          origin_neighborhood?: string | null
          paid_at?: string | null
          pet_id?: string | null
          pet_name: string
          pet_size?: string
          preferred_driver_id?: string | null
          preferred_until?: string | null
          price_cents?: number
          return_fee_cents?: number
          return_of_ride_id?: string | null
          return_scheduled_at?: string | null
          scheduled_at?: string
          service_type?: string
          share_token?: string
          status?: Database["public"]["Enums"]["ride_status"]
          stops?: Json
          trunk_fee_cents?: number
          tutor_id: string
          updated_at?: string
          waiting_fee_cents?: number
          waiting_minutes?: number
        }
        Update: {
          arrived_at?: string | null
          created_at?: string
          destination_address?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_neighborhood?: string | null
          distance_km?: number
          driver_id?: string | null
          driver_lat?: number | null
          driver_lng?: number | null
          driver_waits?: boolean
          has_return?: boolean
          id?: string
          location_updated_at?: string | null
          needs_trunk?: boolean
          notes?: string | null
          origin_address?: string
          origin_lat?: number | null
          origin_lng?: number | null
          origin_neighborhood?: string | null
          paid_at?: string | null
          pet_id?: string | null
          pet_name?: string
          pet_size?: string
          preferred_driver_id?: string | null
          preferred_until?: string | null
          price_cents?: number
          return_fee_cents?: number
          return_of_ride_id?: string | null
          return_scheduled_at?: string | null
          scheduled_at?: string
          service_type?: string
          share_token?: string
          status?: Database["public"]["Enums"]["ride_status"]
          stops?: Json
          trunk_fee_cents?: number
          tutor_id?: string
          updated_at?: string
          waiting_fee_cents?: number
          waiting_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "rides_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_return_of_ride_id_fkey"
            columns: ["return_of_ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          brand: string
          color: string
          created_at: string
          driver_id: string
          id: string
          model: string
          plate: string
          updated_at: string
          vehicle_type: string
          year: number
        }
        Insert: {
          brand: string
          color: string
          created_at?: string
          driver_id: string
          id?: string
          model: string
          plate: string
          updated_at?: string
          vehicle_type?: string
          year: number
        }
        Update: {
          brand?: string
          color?: string
          created_at?: string
          driver_id?: string
          id?: string
          model?: string
          plate?: string
          updated_at?: string
          vehicle_type?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_ride: {
        Args: { _ride_id: string }
        Returns: {
          arrived_at: string | null
          created_at: string
          destination_address: string
          destination_lat: number | null
          destination_lng: number | null
          destination_neighborhood: string | null
          distance_km: number
          driver_id: string | null
          driver_lat: number | null
          driver_lng: number | null
          driver_waits: boolean
          has_return: boolean
          id: string
          location_updated_at: string | null
          needs_trunk: boolean
          notes: string | null
          origin_address: string
          origin_lat: number | null
          origin_lng: number | null
          origin_neighborhood: string | null
          paid_at: string | null
          pet_id: string | null
          pet_name: string
          pet_size: string
          preferred_driver_id: string | null
          preferred_until: string | null
          price_cents: number
          return_fee_cents: number
          return_of_ride_id: string | null
          return_scheduled_at: string | null
          scheduled_at: string
          service_type: string
          share_token: string
          status: Database["public"]["Enums"]["ride_status"]
          stops: Json
          trunk_fee_cents: number
          tutor_id: string
          updated_at: string
          waiting_fee_cents: number
          waiting_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_user_emails: {
        Args: never
        Returns: {
          email: string
          last_sign_in_at: string
          user_id: string
        }[]
      }
      cpf_disponivel: { Args: { _cpf: string }; Returns: boolean }
      eta_avg_speed: {
        Args: { _hour: number; _weekday: number }
        Returns: {
          avg_speed_kmh: number
          samples: number
          source: string
          updated_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["platform_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_driver: { Args: { _user_id: string }; Returns: boolean }
      is_ride_participant: {
        Args: { _ride_id: string; _user_id: string }
        Returns: boolean
      }
      list_preferred_drivers: {
        Args: never
        Returns: {
          avatar_path: string
          full_name: string
          user_id: string
          vehicle_brand: string
          vehicle_color: string
          vehicle_model: string
        }[]
      }
      mark_driver_arrived: {
        Args: { _ride_id: string }
        Returns: {
          arrived_at: string | null
          created_at: string
          destination_address: string
          destination_lat: number | null
          destination_lng: number | null
          destination_neighborhood: string | null
          distance_km: number
          driver_id: string | null
          driver_lat: number | null
          driver_lng: number | null
          driver_waits: boolean
          has_return: boolean
          id: string
          location_updated_at: string | null
          needs_trunk: boolean
          notes: string | null
          origin_address: string
          origin_lat: number | null
          origin_lng: number | null
          origin_neighborhood: string | null
          paid_at: string | null
          pet_id: string | null
          pet_name: string
          pet_size: string
          preferred_driver_id: string | null
          preferred_until: string | null
          price_cents: number
          return_fee_cents: number
          return_of_ride_id: string | null
          return_scheduled_at: string | null
          scheduled_at: string
          service_type: string
          share_token: string
          status: Database["public"]["Enums"]["ride_status"]
          stops: Json
          trunk_fee_cents: number
          tutor_id: string
          updated_at: string
          waiting_fee_cents: number
          waiting_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_credit_balance_cents: { Args: never; Returns: number }
      pet_photo_readable: { Args: { _name: string }; Returns: boolean }
      refresh_eta_calibration: { Args: { _days?: number }; Returns: number }
      review_driver_application: {
        Args: {
          _driver_id: string
          _reason?: string
          _status: Database["public"]["Enums"]["driver_status"]
        }
        Returns: {
          avatar_path: string | null
          birth_date: string
          city: string
          cpf: string
          created_at: string
          email: string
          full_name: string
          id: string
          neighborhood: string
          phone: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["driver_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "drivers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ride_counterpart_contact: {
        Args: { _ride_id: string }
        Returns: {
          avatar_path: string
          full_name: string
          phone: string
          vehicle_brand: string
          vehicle_color: string
          vehicle_model: string
          vehicle_plate: string
        }[]
      }
      set_ride_status: {
        Args: {
          _ride_id: string
          _status: Database["public"]["Enums"]["ride_status"]
        }
        Returns: {
          arrived_at: string | null
          created_at: string
          destination_address: string
          destination_lat: number | null
          destination_lng: number | null
          destination_neighborhood: string | null
          distance_km: number
          driver_id: string | null
          driver_lat: number | null
          driver_lng: number | null
          driver_waits: boolean
          has_return: boolean
          id: string
          location_updated_at: string | null
          needs_trunk: boolean
          notes: string | null
          origin_address: string
          origin_lat: number | null
          origin_lng: number | null
          origin_neighborhood: string | null
          paid_at: string | null
          pet_id: string | null
          pet_name: string
          pet_size: string
          preferred_driver_id: string | null
          preferred_until: string | null
          price_cents: number
          return_fee_cents: number
          return_of_ride_id: string | null
          return_scheduled_at: string | null
          scheduled_at: string
          service_type: string
          share_token: string
          status: Database["public"]["Enums"]["ride_status"]
          stops: Json
          trunk_fee_cents: number
          tutor_id: string
          updated_at: string
          waiting_fee_cents: number
          waiting_minutes: number
        }
        SetofOptions: {
          from: "*"
          to: "rides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "tutor" | "driver"
      document_status: "pendente" | "aprovado" | "rejeitado"
      driver_document_type: "cnh" | "crlv" | "comprovante_residencia"
      driver_status:
        | "pendente"
        | "em_analise"
        | "aprovado"
        | "rejeitado"
        | "suspenso"
      platform_role: "admin"
      ride_status:
        | "pending"
        | "accepted"
        | "en_route"
        | "in_progress"
        | "completed"
        | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["tutor", "driver"],
      document_status: ["pendente", "aprovado", "rejeitado"],
      driver_document_type: ["cnh", "crlv", "comprovante_residencia"],
      driver_status: [
        "pendente",
        "em_analise",
        "aprovado",
        "rejeitado",
        "suspenso",
      ],
      platform_role: ["admin"],
      ride_status: [
        "pending",
        "accepted",
        "en_route",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
