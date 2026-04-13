# frozen_string_literal: true

module Types
  class NotifiableType < Types::BaseUnion
    description "通知の対象（BudgetAlertまたはUnclassifiedAlert）"

    possible_types Types::BudgetAlertType, Types::UnclassifiedAlertType

    def self.resolve_type(object, _context)
      case object
      when BudgetAlert      then Types::BudgetAlertType
      when UnclassifiedAlert then Types::UnclassifiedAlertType
      end
    end
  end
end
