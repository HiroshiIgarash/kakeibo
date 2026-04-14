# frozen_string_literal: true

module Mutations
  module StoreMappings
    class UpdateStoreMapping < Mutations::BaseMutation
      description "店名とカテゴリのマッピングを作成または更新する"

      argument :store_name,  String, required: true
      argument :category_id, ID,     required: true

      field :store_mapping, Types::StoreCategoryMappingType, null: true
      field :errors,        [ String ],                      null: false

      def resolve(store_name:, category_id:)
        category = Category.find_by(id: category_id)

        unless category
          return { store_mapping: nil, errors: [ "Category not found" ] }
        end

        mapping = StoreCategoryMapping.find_or_initialize_by(store_name: store_name)
        mapping.category = category

        if mapping.save
          { store_mapping: mapping, errors: [] }
        else
          { store_mapping: nil, errors: mapping.errors.full_messages }
        end
      end
    end
  end
end
