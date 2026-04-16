# frozen_string_literal: true

module Mutations
  module StoreMappings
    class DeleteStoreMapping < Mutations::BaseMutation
      description "店名とカテゴリのマッピングを削除する"

      argument :id, ID, required: true

      field :store_mapping, Types::StoreCategoryMappingType, null: true
      field :errors,        [ String ],                      null: false

      def resolve(id:)
        mapping = StoreCategoryMapping.find_by(id: id)

        if mapping.nil?
          return { store_mapping: nil, errors: [ "IDが見つかりません: #{id}" ] }
        end

        mapping.destroy
        { store_mapping: mapping, errors: [] }
      end
    end
  end
end
