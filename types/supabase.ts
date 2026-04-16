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
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      case_items: {
        Row: {
          case_id: string
          created_at: string
          drop_chance: number
          id: string
          item_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          drop_chance: number
          id?: string
          item_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          drop_chance?: number
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'case_items_case_id_fkey'
            columns: ['case_id']
            isOneToOne: false
            referencedRelation: 'cases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'case_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
        ]
      }
      cases: {
        Row: {
          case_key: string
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
        }
        Insert: {
          case_key: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
        }
        Update: {
          case_key?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      chest_open_events: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          case_id: string | null
          case_quantity_after: number | null
          case_quantity_before: number | null
          created_at: string | null
          id: string
          item_id: string | null
          price: number
          request_id: string
          stars_after: number | null
          stars_before: number | null
          user_id: string | null
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          case_id?: string | null
          case_quantity_after?: number | null
          case_quantity_before?: number | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          price: number
          request_id: string
          stars_after?: number | null
          stars_before?: number | null
          user_id?: string | null
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          case_id?: string | null
          case_quantity_after?: number | null
          case_quantity_before?: number | null
          created_at?: string | null
          id?: string
          item_id?: string | null
          price?: number
          request_id?: string
          stars_after?: number | null
          stars_before?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'chest_open_events_case_id_fkey'
            columns: ['case_id']
            isOneToOne: false
            referencedRelation: 'cases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chest_open_events_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'chest_open_events_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      invite_rewards: {
        Row: {
          amount: number | null
          created_at: string
          error: string | null
          granted_at: string | null
          id: string
          invitation_id: string
          invitee_user_id: string
          inviter_user_id: string
          item_id: string | null
          quantity: number
          reward_type: string
          status: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          error?: string | null
          granted_at?: string | null
          id?: string
          invitation_id: string
          invitee_user_id: string
          inviter_user_id: string
          item_id?: string | null
          quantity?: number
          reward_type: string
          status?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          error?: string | null
          granted_at?: string | null
          id?: string
          invitation_id?: string
          invitee_user_id?: string
          inviter_user_id?: string
          item_id?: string | null
          quantity?: number
          reward_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invite_rewards_invitation_id_fkey'
            columns: ['invitation_id']
            isOneToOne: false
            referencedRelation: 'user_invites'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invite_rewards_invitee_user_id_fkey'
            columns: ['invitee_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invite_rewards_inviter_user_id_fkey'
            columns: ['inviter_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invite_rewards_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
        ]
      }
      items: {
        Row: {
          border: string
          color: string
          created_at: string
          hex: string
          id: string
          name: string
          rarity: string
        }
        Insert: {
          border: string
          color: string
          created_at?: string
          hex: string
          id?: string
          name: string
          rarity: string
        }
        Update: {
          border?: string
          color?: string
          created_at?: string
          hex?: string
          id?: string
          name?: string
          rarity?: string
        }
        Relationships: []
      }
      leaderboard: {
        Row: {
          id: string
          played_at: string
          score: number
          user_id: string
        }
        Insert: {
          id?: string
          played_at?: string
          score: number
          user_id: string
        }
        Update: {
          id?: string
          played_at?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'leaderboard_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      purchase_orders: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          created_at: string
          currency: string
          id: string
          product_id: string
          quantity: number
          request_id: string
          stars_after: number | null
          stars_before: number | null
          status: string
          total_price: number
          unit_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          currency: string
          id?: string
          product_id: string
          quantity: number
          request_id: string
          stars_after?: number | null
          stars_before?: number | null
          status?: string
          total_price: number
          unit_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          currency?: string
          id?: string
          product_id?: string
          quantity?: number
          request_id?: string
          stars_after?: number | null
          stars_before?: number | null
          status?: string
          total_price?: number
          unit_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'purchase_orders_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'shop_products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_orders_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      resource_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string | null
          resource_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason?: string | null
          resource_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string | null
          resource_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'resource_transactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      shop_products: {
        Row: {
          case_id: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          item_id: string | null
          price: number
          product_type: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          currency: string
          description?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          price: number
          product_type: string
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          price?: number
          product_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'shop_products_case_id_fkey'
            columns: ['case_id']
            isOneToOne: false
            referencedRelation: 'cases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shop_products_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
        ]
      }
      user_cases: {
        Row: {
          case_id: string
          created_at: string
          id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_cases_case_id_fkey'
            columns: ['case_id']
            isOneToOne: false
            referencedRelation: 'cases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_cases_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      user_invites: {
        Row: {
          created_at: string
          id: string
          invite_code: string | null
          invitee_games_played_at_invite: number
          invitee_telegram_id: number
          invitee_user_id: string
          inviter_telegram_id: number
          inviter_user_id: string
          qualified_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code?: string | null
          invitee_games_played_at_invite?: number
          invitee_telegram_id: number
          invitee_user_id: string
          inviter_telegram_id: number
          inviter_user_id: string
          qualified_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string | null
          invitee_games_played_at_invite?: number
          invitee_telegram_id?: number
          invitee_user_id?: string
          inviter_telegram_id?: number
          inviter_user_id?: string
          qualified_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_invites_invitee_user_id_fkey'
            columns: ['invitee_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_invites_inviter_user_id_fkey'
            columns: ['inviter_user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      user_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          quantity: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          quantity?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          quantity?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_items_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          balance: number
          created_at: string
          dex_tokens: number | null
          first_name: string
          games_played: number | null
          high_score: number | null
          id: string
          last_name: string | null
          stars: number | null
          telegram_id: number
          total_score: number | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          dex_tokens?: number | null
          first_name: string
          games_played?: number | null
          high_score?: number | null
          id?: string
          last_name?: string | null
          stars?: number | null
          telegram_id: number
          total_score?: number | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          dex_tokens?: number | null
          first_name?: string
          games_played?: number | null
          high_score?: number | null
          id?: string
          last_name?: string | null
          stars?: number | null
          telegram_id?: number
          total_score?: number | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      execute_asset_transaction: {
        Args: {
          p_amount: number
          p_reason: string
          p_resource_type: string
          p_telegram_id: number
        }
        Returns: Json
      }
      open_chest_secure: {
        Args: {
          p_chest_id: string
          p_item_id: string
          p_price: number
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      shop_purchase: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_request_id: string
          p_user_id: string
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
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

