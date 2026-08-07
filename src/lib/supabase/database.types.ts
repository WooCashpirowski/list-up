import type {
  Category,
  CategoryInsert,
  CategoryUpdate,
} from '@/src/modules/categories/types/category.types'
import type {
  ListItem,
  ListItemInsert,
  ListItemUpdate,
} from '@/src/modules/list-items/types/list-item.types'
import type {
  List,
  ListInsert,
  ListUpdate,
} from '@/src/modules/lists/types/list.types'
import type {
  Profile,
  ProfileInsert,
  ProfileUpdate,
} from '@/src/modules/profiles/types/profile.types'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: ProfileInsert
        Update: ProfileUpdate
        Relationships: []
      }
      lists: {
        Row: List
        Insert: ListInsert
        Update: ListUpdate
        Relationships: [
          {
            foreignKeyName: 'lists_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: Category
        Insert: CategoryInsert
        Update: CategoryUpdate
        Relationships: [
          {
            foreignKeyName: 'categories_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      list_items: {
        Row: ListItem
        Insert: ListItemInsert
        Update: ListItemUpdate
        Relationships: [
          {
            foreignKeyName: 'list_items_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'list_items_list_id_fkey'
            columns: ['list_id']
            isOneToOne: false
            referencedRelation: 'lists'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
