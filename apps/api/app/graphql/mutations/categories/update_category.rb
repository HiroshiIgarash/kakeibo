# frozen_string_literal: true

module Mutations
  module Categories
    class UpdateCategory < Mutations::BaseMutation
      description "Categoryを更新する"

      argument :id,    ID,     required: true
      argument :name,  String, required: false
      argument :color, String, required: false

      field :category, Types::CategoryType, null: true
      field :errors,   [ String ],          null: false

      def resolve(id:, **attrs)
        category = Category.find_by(id: id)

        if category.nil?
          return { category: nil, errors: [ "IDが見つかりません: #{id}" ] }
        end

        if category.update(attrs.compact)
          { category: category, errors: [] }
        else
          { category: nil, errors: category.errors.full_messages }
        end
      end
    end
  end
end
