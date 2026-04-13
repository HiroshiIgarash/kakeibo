# frozen_string_literal: true

module Mutations
  module Categories
    class DeleteCategory < Mutations::BaseMutation
      description "Categoryを削除する"

      argument :id, ID, required: true

      field :category, Types::CategoryType, null: true
      field :errors,   [ String ],          null: false

      def resolve(id:)
        category = Category.find_by(id: id)

        if category.nil?
          return { category: nil, errors: [ "IDが見つかりません: #{id}" ] }
        end

        category.destroy
        { category: category, errors: [] }
      end
    end
  end
end
