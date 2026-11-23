package soda.identity

import cats.effect.IO
import soda.infrastructure.Database

final class Accounts(db: Database):
  def login(request: Login): IO[Option[(Token, Identity)]] = db.transaction { c =>
    Identities.authenticateOrRegister(c, request).map { player =>
      val identity = Identity(player, request.name)
      (Identities.issue(c, identity), identity)
    }
  }

  def resolve(token: Token): IO[Option[Identity]] = db.transaction(Identities.resolve(_, token))
