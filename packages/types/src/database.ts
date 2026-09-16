export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address: string
          created_at: string
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_delivery_schedules: {
        Row: {
          created_at: string
          id: string
          interval_days: number
          is_active: boolean
          next_delivery_date: string
          quantity: number
          supplier_customer_id: string
          supplier_product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_days: number
          is_active?: boolean
          next_delivery_date: string
          quantity: number
          supplier_customer_id: string
          supplier_product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_days?: number
          is_active?: boolean
          next_delivery_date?: string
          quantity?: number
          supplier_customer_id?: string
          supplier_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_delivery_schedules_supplier_customer_id_fkey"
            columns: ["supplier_customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_delivery_schedules_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_jar_balances: {
        Row: {
          created_at: string
          id: string
          jars_with_customer: number
          supplier_customer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jars_with_customer?: number
          supplier_customer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jars_with_customer?: number
          supplier_customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_jar_balances_supplier_customer_id_fkey"
            columns: ["supplier_customer_id"]
            isOneToOne: true
            referencedRelation: "supplier_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_product_prices: {
        Row: {
          created_at: string
          effective_from: string
          effective_until: string | null
          id: string
          price: number
          supplier_customer_id: string
          supplier_product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          price: number
          supplier_customer_id: string
          supplier_product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          id?: string
          price?: number
          supplier_customer_id?: string
          supplier_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_product_prices_supplier_customer_id_fkey"
            columns: ["supplier_customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_prices_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string
          delivery_date: string
          id: string
          status: string
          supplier_customer_id: string
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date: string
          id?: string
          status: string
          supplier_customer_id: string
          supplier_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          id?: string
          status?: string
          supplier_customer_id?: string
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_supplier_customer_id_fkey"
            columns: ["supplier_customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          quantity: number
          supplier_product_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          quantity: number
          supplier_product_id: string
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          quantity?: number
          supplier_product_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_supplier_product_id_fkey"
            columns: ["supplier_product_id"]
            isOneToOne: false
            referencedRelation: "supplier_products"
            referencedColumns: ["id"]
          },
        ]
      }
      jar_transactions: {
        Row: {
          delivery_id: string | null
          id: string
          jars_delivered: number
          jars_returned: number
          supplier_customer_id: string
          transaction_date: string
        }
        Insert: {
          delivery_id?: string | null
          id?: string
          jars_delivered?: number
          jars_returned?: number
          supplier_customer_id: string
          transaction_date?: string
        }
        Update: {
          delivery_id?: string | null
          id?: string
          jars_delivered?: number
          jars_returned?: number
          supplier_customer_id?: string
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "jar_transactions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jar_transactions_supplier_customer_id_fkey"
            columns: ["supplier_customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          total?: number
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
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string
          capacity_date: string | null
          created_at: string
          customer_id: string
          delivery_fee: number
          display_id: string
          id: string
          payment_method: string
          payment_status: string
          rejection_reason: string | null
          status: string
          subtotal: number
          supplier_id: string
          total: number
          updated_at: string
        }
        Insert: {
          address_id: string
          capacity_date?: string | null
          created_at?: string
          customer_id: string
          delivery_fee?: number
          display_id: string
          id?: string
          payment_method: string
          payment_status: string
          rejection_reason?: string | null
          status: string
          subtotal: number
          supplier_id: string
          total: number
          updated_at?: string
        }
        Update: {
          address_id?: string
          capacity_date?: string | null
          created_at?: string
          customer_id?: string
          delivery_fee?: number
          display_id?: string
          id?: string
          payment_method?: string
          payment_status?: string
          rejection_reason?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          delivery_id: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          supplier_customer_id: string
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          delivery_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          supplier_customer_id: string
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_id?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          supplier_customer_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supplier_customer_id_fkey"
            columns: ["supplier_customer_id"]
            isOneToOne: false
            referencedRelation: "supplier_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          unit: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          unit?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          unit?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_capacity: {
        Row: {
          created_at: string
          date: string
          fulfilled_quantity: number
          id: string
          max_capacity: number
          reserved_quantity: number
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          fulfilled_quantity?: number
          id?: string
          max_capacity: number
          reserved_quantity?: number
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          fulfilled_quantity?: number
          id?: string
          max_capacity?: number
          reserved_quantity?: number
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_capacity_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_customers: {
        Row: {
          address: string | null
          created_at: string
          customer_type: Database["public"]["Enums"]["customer_type_enum"]
          id: string
          is_active: boolean
          landmark: string | null
          name: string
          normalized_phone: string
          notes: string | null
          phone: string
          sector: string | null
          supplier_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type_enum"]
          id?: string
          is_active?: boolean
          landmark?: string | null
          name: string
          normalized_phone: string
          notes?: string | null
          phone: string
          sector?: string | null
          supplier_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_type?: Database["public"]["Enums"]["customer_type_enum"]
          id?: string
          is_active?: boolean
          landmark?: string | null
          name?: string
          normalized_phone?: string
          notes?: string | null
          phone?: string
          sector?: string | null
          supplier_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_customers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          available: boolean
          created_at: string
          id: string
          price: number
          product_id: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          id?: string
          price: number
          product_id: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          business_name: string
          created_at: string
          description: string | null
          id: string
          is_accepting_orders: boolean
          is_active: boolean
          lat: number | null
          lng: number | null
          phone: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_name: string
          created_at?: string
          description?: string | null
          id?: string
          is_accepting_orders?: boolean
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          phone?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_name?: string
          created_at?: string
          description?: string | null
          id?: string
          is_accepting_orders?: boolean
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          phone?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      supplier_capacity_view: {
        Row: {
          available_quantity: number | null
          created_at: string | null
          date: string | null
          fulfilled_quantity: number | null
          id: string | null
          max_capacity: number | null
          reserved_quantity: number | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          available_quantity?: never
          created_at?: string | null
          date?: string | null
          fulfilled_quantity?: number | null
          id?: string | null
          max_capacity?: number | null
          reserved_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          available_quantity?: never
          created_at?: string | null
          date?: string | null
          fulfilled_quantity?: number | null
          id?: string | null
          max_capacity?: number | null
          reserved_quantity?: number | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_capacity_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_order: { Args: { p_order_id: string }; Returns: undefined }
      admin_reassign_order: {
        Args: { p_new_supplier_id: string; p_order_id: string }
        Returns: undefined
      }
      complete_delivery: {
        Args: {
          p_amount_collected: number
          p_customer_id: string
          p_jars_delivered: number
          p_jars_returned: number
          p_payment_method: string
          p_price: number
          p_quantity: number
          p_supplier_product_id: string
        }
        Returns: string
      }
      create_delivery_schedule: {
        Args: {
          p_customer_id: string
          p_first_delivery_date: string
          p_interval_days: number
          p_quantity: number
          p_supplier_product_id: string
        }
        Returns: undefined
      }
      create_supplier_customer: {
        Args: {
          p_address: string
          p_customer_type: Database["public"]["Enums"]["customer_type_enum"]
          p_name: string
          p_normalized_phone: string
          p_phone: string
          p_sector: string
        }
        Returns: string
      }
      get_available_suppliers: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          address: string
          available_quantity: number
          business_name: string
          description: string
          distance: number
          distance_km: number
          id: string
          is_accepting_orders: boolean
          lat: number
          lng: number
          phone: string
          price: number
          profile_id: string
        }[]
      }
      get_supplier_id: { Args: never; Returns: string }
      get_supplier_today: { Args: never; Returns: Json }
      get_user_role: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      place_order: {
        Args: {
          p_address_id: string
          p_payment_method: string
          p_product_id: string
          p_quantity: number
          p_supplier_id: string
        }
        Returns: string
      }
      reject_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      set_customer_price: {
        Args: {
          p_customer_id: string
          p_price: number
          p_supplier_product_id: string
        }
        Returns: undefined
      }
      set_supplier_capacity: {
        Args: { p_date: string; p_max_capacity: number }
        Returns: undefined
      }
      set_supplier_product: {
        Args: { p_available: boolean; p_price: number; p_product_id: string }
        Returns: undefined
      }
      update_order_status: {
        Args: { p_new_status: string; p_order_id: string }
        Returns: undefined
      }
      update_supplier_profile: {
        Args: {
          p_address?: string
          p_business_name?: string
          p_description?: string
          p_is_accepting_orders?: boolean
          p_lat?: number
          p_lng?: number
          p_phone?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      customer_type_enum:
        | "household"
        | "office"
        | "factory"
        | "shop"
        | "restaurant"
        | "hostel"
        | "hospital"
        | "event"
        | "other"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      customer_type_enum: [
        "household",
        "office",
        "factory",
        "shop",
        "restaurant",
        "hostel",
        "hospital",
        "event",
        "other",
      ],
    },
  },
} as const

